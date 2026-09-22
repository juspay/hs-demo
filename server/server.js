const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxyUrl) {
  const { ProxyAgent, setGlobalDispatcher } = require('undici');
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  console.log(`Outgoing requests proxied via: ${proxyUrl}`);
}

const app = express();
const PORT = process.env.PORT || 5252;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

const getCredentials = (req) => {
  const isDebugMode = req.headers['x-debug-mode'] === 'true';
  
  if (isDebugMode) {
    const debugCreds = {
      publishableKey: req.headers['x-publishable-key'],
      secretKey: req.headers['x-secret-key'],
      profileId: req.headers['x-profile-id'],
      merchantId: req.headers['x-merchant-id'],
      serverUrl: process.env.HYPERSWITCH_SERVER_URL,
    };
    
    if (!debugCreds.secretKey || !debugCreds.profileId) {
      return null;
    }
    
    return { ...debugCreds, isDebugMode: true };
  }
  
  return {
    publishableKey: process.env.HYPERSWITCH_PUBLISHABLE_KEY,
    secretKey: process.env.HYPERSWITCH_SECRET_KEY,
    profileId: process.env.PROFILE_ID,
    merchantId: null,
    serverUrl: process.env.HYPERSWITCH_SERVER_URL,
    isDebugMode: false,
  };
};

// Config endpoint
app.get('/config', (req, res) => {
  const creds = getCredentials(req);
  
  if (creds.isDebugMode && !creds.publishableKey) {
    return res.status(400).json({ error: 'Debug credentials not provided' });
  }
  
  res.json({
    publishableKey: creds.publishableKey,
    profileId: creds.profileId,
    isDebugMode: creds.isDebugMode,
  });
});

// URLs endpoint
app.get('/urls', (req, res) => {
  const creds = getCredentials(req);
  
  res.json({
    serverUrl: creds.serverUrl || process.env.HYPERSWITCH_SERVER_URL,
    clientUrl: process.env.HYPERSWITCH_CLIENT_URL,
  });
});

// Embedded components: token endpoint for hyperswitch-control-center-embedded SDK
app.get('/api/embedded/hyperswitch', async (req, res) => {
  try {
    const apiKey = process.env.HYPERSWITCH_SECRET_KEY;
    const profileId = process.env.EMBED_PROFILE_ID;
    const baseUrl = process.env.HYPERSWITCH_BASE_URL || 'https://app.hyperswitch.io';

    if (!apiKey || !profileId) {
      return res.status(500).json({
        error: 'Missing required environment variables: HYPERSWITCH_SECRET_KEY and EMBED_PROFILE_ID',
      });
    }

    const upstream = await fetch(`${baseUrl}/api/embedded/token`, {
      method: 'GET',
      headers: {
        'api-key': apiKey,
        'x-profile-id': profileId,
        'Content-Type': 'application/json',
      },
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: 'Failed to fetch token from Hyperswitch API',
        details: data,
      });
    }

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error calling Hyperswitch embedded token API:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch token from Hyperswitch API',
      details: error.message,
    });
  }
});

// Create customer endpoint
app.post('/api/create-customer', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const customerData = {
      name: 'Customer ' + Date.now(),
      email: 'customer' + Date.now() + '@example.com',
      phone: '9999999999',
      phone_country_code: '+1',
    };

    const response = await fetch(`${creds.serverUrl}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
      },
      body: JSON.stringify(customerData),
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create payment intent endpoint
app.post('/api/create-intent', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const { flowType, amount = 10000, currency = 'USD', customer_id } = req.body;
    
    // Use external vault profile ID for vault_3 flow, or debug profile_id if in debug mode
    const profileId = creds.isDebugMode 
      ? creds.profileId
      : flowType === 'vault_3' 
        ? 'pro_ukJVFiPH0bzYFZwBPi9j' 
        : process.env.PROFILE_ID;
    
    let paymentData = {
      amount: amount,
      currency: currency,
      confirm: false,
      customer_id: customer_id || (creds.isDebugMode ? null : process.env.CUSTOMER_ID),
      profile_id: profileId,
      capture_method: 'automatic',
      authentication_type: flowType === 'three_ds_psp' ? 'three_ds' : 'no_three_ds',
    };

    // Adjust based on flow type
    if (flowType === 'manual' || flowType === 'manual_partial') {
      paymentData.capture_method = 'manual';
    }

    if (flowType === 'zero_setup') {
      paymentData.setup_future_usage = 'off_session';
      paymentData.payment_type = 'setup_mandate';
      paymentData.customer_acceptance = {
        acceptance_type: 'offline',
      };
    }

    if (flowType === 'setup_and_charge') {
      paymentData.setup_future_usage = 'off_session';
      paymentData.customer_acceptance = {
        acceptance_type: 'offline',
      };
    }

    const response = await fetch(`${creds.serverUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
        ...(flowType === 'vault_3' && { 'X-Profile-Id': 'pro_ukJVFiPH0bzYFZwBPi9j' }),
      },
      body: JSON.stringify(paymentData),
    });

    const data = await response.json();
    
    if (data.error) {
      return res.status(400).json({ error: data.error });
    }

    res.json({
      client_secret: data.client_secret,
      payment_id: data.payment_id,
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      capture_method: data.capture_method,
      customer_id: data.customer_id,
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: error.message });
  }
});

// Capture payment endpoint
app.post('/api/capture-payment/:id', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const { id } = req.params;
    const { amount_to_capture } = req.body;

    const captureData = {
      amount_to_capture: amount_to_capture,
    };

    const response = await fetch(`${creds.serverUrl}/payments/${id}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
      },
      body: JSON.stringify(captureData),
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error capturing payment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get payment details endpoint
app.get('/api/payment/:id', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const { id } = req.params;

    const response = await fetch(`${creds.serverUrl}/payments/${id}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'api-key': creds.secretKey,
      },
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create customer endpoint (simplified)
app.post('/api/create-customer', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const customerData = {
      name: 'Customer ' + Date.now(),
      email: 'customer' + Date.now() + '@example.com',
      phone: '9999999999',
      phone_country_code: '+1',
    };

    const response = await fetch(`${creds.serverUrl}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
      },
      body: JSON.stringify(customerData),
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create recurring charge (server-side, no SDK)
app.post('/api/create-recurring-charge', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const { customer_id, payment_method_id, amount = 10000 } = req.body;

    const paymentData = {
      amount: amount,
      currency: 'USD',
      confirm: true,
      customer_id: customer_id,
      profile_id: creds.profileId,
      capture_method: 'automatic',
      authentication_type: 'no_three_ds',
      off_session: true,
      recurring_details: {
        type: 'payment_method_id',
        data: payment_method_id,
      },
    };

    const response = await fetch(`${creds.serverUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
      },
      body: JSON.stringify(paymentData),
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Hyperswitch error:', data.error);
      return res.status(400).json({ error: data.error });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error creating recurring charge:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create recurring charge with Network Transaction ID (server-side, no SDK)
app.post('/api/create-recurring-charge-ntid', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const { customer_id, network_transaction_id, amount = 10000, card_data } = req.body;

    const paymentData = {
      amount: amount,
      currency: 'USD',
      confirm: true,
      customer_id: customer_id,
      profile_id: creds.profileId,
      capture_method: 'automatic',
      authentication_type: 'no_three_ds',
      off_session: true,
      recurring_details: {
        type: 'network_transaction_id_and_card_details',
        data: {
          network_transaction_id: network_transaction_id,
          card_number: card_data.card_number,
          card_exp_month: card_data.card_exp_month,
          card_exp_year: card_data.card_exp_year,
        },
      },
    };

    console.log('Creating recurring charge with NTID:', { customer_id, network_transaction_id });

    const response = await fetch(`${creds.serverUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
      },
      body: JSON.stringify(paymentData),
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Hyperswitch error:', data.error);
      return res.status(400).json({ error: data.error });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error creating recurring charge with NTID:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create recurring charge with PSP Token (server-side, no SDK)
app.post('/api/create-recurring-charge-psp', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    // Frontend now sends the full payment payload with recurring_details
    const paymentData = {
      ...req.body,
      confirm: true,
      profile_id: creds.profileId,
      capture_method: 'automatic',
      authentication_type: 'no_three_ds',
    };

    console.log('Creating recurring charge with PSP token:', paymentData.recurring_details);

    const response = await fetch(`${creds.serverUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
      },
      body: JSON.stringify(paymentData),
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Hyperswitch error:', data.error);
      return res.status(400).json({ error: data.error });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error creating recurring charge with PSP token:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// RELAY FLOWS - Adyen Direct + Hyperswitch Relay
// ============================================

// Step 1: Adyen Authorization (authorize only - for Capture, Void, Incremental Auth)
app.post('/api/adyen/authorize', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const { amount = 10000, card_data } = req.body;
    
    const adyenPayload = {
      amount: {
        currency: 'USD',
        value: amount
      },
      reference: `relay_auth_${Date.now()}`,
      merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT,
      paymentMethod: {
        type: 'scheme',
        number: card_data.card_number,
        expiryMonth: card_data.card_exp_month,
        expiryYear: card_data.card_exp_year,
        cvc: card_data.card_cvc,
        holderName: card_data.card_holder_name || 'John Doe'
      },
      shopperInteraction: 'Ecommerce',
      recurringProcessingModel: 'CardOnFile'
    };

    console.log('Step 1: Creating Adyen authorization...');

    const response = await fetch(`${process.env.ADYEN_BASE_URL}/pal/servlet/Payment/v68/authorise`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.ADYEN_API_KEY,
      },
      body: JSON.stringify(adyenPayload),
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Adyen error:', data.error);
      return res.status(400).json({ error: data.error });
    }

    console.log('Step 1 Complete - Adyen Transaction ID:', data.pspReference);
    
    res.json({
      adyen_transaction_id: data.pspReference,
      adyen_response: data,
    });
  } catch (error) {
    console.error('Error creating Adyen authorization:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 1b: Adyen Authorization + Capture (for Refund)
app.post('/api/adyen/authorize-capture', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const { amount = 10000, card_data } = req.body;
    
    const adyenPayload = {
      amount: {
        currency: 'USD',
        value: amount
      },
      reference: `relay_capture_${Date.now()}`,
      merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT,
      paymentMethod: {
        type: 'scheme',
        number: card_data.card_number,
        expiryMonth: card_data.card_exp_month,
        expiryYear: card_data.card_exp_year,
        cvc: card_data.card_cvc,
        holderName: card_data.card_holder_name || 'John Doe'
      },
      shopperInteraction: 'Ecommerce',
      recurringProcessingModel: 'CardOnFile',
      captureDelayHours: 0 // Auto capture
    };

    console.log('Step 1: Creating Adyen authorization with capture...');

    const response = await fetch(`${process.env.ADYEN_BASE_URL}/pal/servlet/Payment/v68/authorise`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.ADYEN_API_KEY,
      },
      body: JSON.stringify(adyenPayload),
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Adyen error:', data.error);
      return res.status(400).json({ error: data.error });
    }

    console.log('Step 1 Complete - Adyen Transaction ID:', data.pspReference);
    
    res.json({
      adyen_transaction_id: data.pspReference,
      adyen_response: data,
    });
  } catch (error) {
    console.error('Error creating Adyen auth+capture:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 2: Relay - Capture
app.post('/api/relay/capture', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const { adyen_transaction_id, amount = 10000 } = req.body;
    
    const relayPayload = {
      connector_id: process.env.MERCHANT_CONNECTOR_ID,
      connector_resource_id: adyen_transaction_id,
      type: 'capture',
      data: {
        capture: {
          authorized_amount: amount,
          amount_to_capture: amount,
          currency: 'USD',
          capture_method: 'automatic'
        }
      }
    };

    console.log('Step 2: Relay Capture - Using Adyen Transaction ID:', adyen_transaction_id);

    const response = await fetch(`${creds.serverUrl}/relay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
        'X-Profile-Id': creds.profileId,
      },
      body: JSON.stringify(relayPayload),
    });

    const data = await response.json();
    
    console.log('Step 2 Complete - Relay Capture response:', data);
    
    if (data.error) {
      console.error('Relay error:', data.error);
      return res.status(400).json({ error: data.error });
    }

    res.json({
      relay_id: data.relay_id,
      status: data.status,
      type: data.type,
      connector_id: data.connector_id,
      connector_resource_id: data.connector_resource_id,
      adyen_transaction_id: adyen_transaction_id,
    });
  } catch (error) {
    console.error('Error in Relay Capture:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 2: Relay - Refund
app.post('/api/relay/refund', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const { adyen_transaction_id, amount = 10000 } = req.body;
    
    const relayPayload = {
      connector_id: process.env.MERCHANT_CONNECTOR_ID,
      connector_resource_id: adyen_transaction_id,
      type: 'refund',
      data: {
        refund: {
          amount: amount,
          currency: 'USD',
          reason: 'Customer request'
        }
      }
    };

    console.log('Step 2: Relay Refund - Using Adyen Transaction ID:', adyen_transaction_id);

    const response = await fetch(`${creds.serverUrl}/relay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
        'X-Profile-Id': creds.profileId,
      },
      body: JSON.stringify(relayPayload),
    });

    const data = await response.json();
    
    console.log('Step 2 Complete - Relay Refund response:', data);
    
    if (data.error) {
      console.error('Relay error:', data.error);
      return res.status(400).json({ error: data.error });
    }

    res.json({
      relay_id: data.relay_id,
      status: data.status,
      type: data.type,
      connector_id: data.connector_id,
      connector_resource_id: data.connector_resource_id,
      adyen_transaction_id: adyen_transaction_id,
    });
  } catch (error) {
    console.error('Error in Relay Refund:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 2: Relay - Void
app.post('/api/relay/void', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const { adyen_transaction_id } = req.body;
    
    const relayPayload = {
      connector_id: process.env.MERCHANT_CONNECTOR_ID,
      connector_resource_id: adyen_transaction_id,
      type: 'void',
      data: {
        void: {}
      }
    };

    console.log('Step 2: Relay Void - Using Adyen Transaction ID:', adyen_transaction_id);

    const response = await fetch(`${creds.serverUrl}/relay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
        'X-Profile-Id': creds.profileId,
      },
      body: JSON.stringify(relayPayload),
    });

    const data = await response.json();
    
    console.log('Step 2 Complete - Relay Void response:', data);
    
    if (data.error) {
      console.error('Relay error:', data.error);
      return res.status(400).json({ error: data.error });
    }

    res.json({
      relay_id: data.relay_id,
      status: data.status,
      type: data.type,
      connector_id: data.connector_id,
      connector_resource_id: data.connector_resource_id,
      adyen_transaction_id: adyen_transaction_id,
    });
  } catch (error) {
    console.error('Error in Relay Void:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 2: Relay - Incremental Authorization
app.post('/api/relay/incremental-auth', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const { adyen_transaction_id, additional_amount = 5000 } = req.body;
    
    const relayPayload = {
      connector_id: process.env.MERCHANT_CONNECTOR_ID,
      connector_resource_id: adyen_transaction_id,
      type: 'incremental_authorization',
      data: {
        incremental_authorization: {
          total_amount: 15000,
          additional_amount: additional_amount,
          currency: 'USD'
        }
      }
    };

    console.log('Step 2: Relay Incremental Auth - Using Adyen Transaction ID:', adyen_transaction_id);

    const response = await fetch(`${creds.serverUrl}/relay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
        'X-Profile-Id': creds.profileId,
      },
      body: JSON.stringify(relayPayload),
    });

    const data = await response.json();
    
    console.log('Step 2 Complete - Relay Incremental Auth response:', data);
    
    if (data.error) {
      console.error('Relay error:', data.error);
      return res.status(400).json({ error: data.error });
    }

    res.json({
      relay_id: data.relay_id,
      status: data.status,
      type: data.type,
      connector_id: data.connector_id,
      connector_resource_id: data.connector_resource_id,
      adyen_transaction_id: adyen_transaction_id,
    });
  } catch (error) {
    console.error('Error in Relay Incremental Auth:', error);
    res.status(500).json({ error: error.message });
  }
});

// Standalone 3DS Payment endpoint
app.post('/api/create-intent-3ds', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const paymentData = req.body;

    console.log('Creating standalone 3DS payment intent...');

    const response = await fetch(`${creds.serverUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
      },
      body: JSON.stringify(paymentData),
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Hyperswitch error:', data.error);
      return res.status(400).json({ error: data.error });
    }

    res.json({
      client_secret: data.client_secret,
      payment_id: data.payment_id,
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      connector: data.connector,
      split_payments: data.split_payments,
      publishable_key: 'pk_snd_ad36b97873a04c058daf1ba6dd1b3113'
    });
  } catch (error) {
    console.error('Error creating 3DS payment intent:', error);
    res.status(500).json({ error: error.message });
  }
});

// Import 3DS Results - server-side payment with confirm: true
app.post('/api/import-3ds-results', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const { amount = 10000, currency = 'USD', customer_id, three_ds_data, card_data } = req.body;
    
    let paymentData = {
      amount: amount,
      currency: currency,
      confirm: true,
      customer_id: customer_id || (creds.isDebugMode ? null : process.env.CUSTOMER_ID),
      profile_id: creds.profileId,
      capture_method: 'automatic',
      authentication_type: 'three_ds',
      three_ds_data: three_ds_data,
      payment_method: 'card',
      payment_method_type: 'credit',
      payment_method_data: {
        card: {
          card_number: card_data.card_number,
          card_exp_month: card_data.card_exp_month,
          card_exp_year: card_data.card_exp_year,
          card_cvc: card_data.card_cvc,
          card_holder_name: card_data.card_holder_name || 'John Doe',
        },
      },
      browser_info: {
        user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        accept_header: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        language: "en-US",
        color_depth: 24,
        screen_height: 1080,
        screen_width: 1920,
        time_zone: -330,
        java_enabled: true,
        java_script_enabled: true,
      },
    };

    console.log('Importing 3DS results and creating payment:', { customer_id, three_ds_data });

    const response = await fetch(`${creds.serverUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
      },
      body: JSON.stringify(paymentData),
    });

    const data = await response.json();
    
    console.log('Hyperswitch API response for Import 3DS:', JSON.stringify(data, null, 2));
    
    if (data.error) {
      console.error('Hyperswitch API error:', data.error);
      return res.status(400).json({ error: data.error });
    }

    res.json(data);
  } catch (error) {
    console.error('Error importing 3DS results:', error);
    res.status(500).json({ error: error.message });
  }
});

// Payment Links endpoint
app.post('/api/create-payment-link', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const { amount = 10000, currency = 'USD', description = 'Payment Link' } = req.body;

    const paymentData = {
      amount: amount,
      currency: currency,
      confirm: false,
      profile_id: creds.profileId,
      capture_method: 'automatic',
      authentication_type: 'no_three_ds',
      payment_link: true,
      return_url: 'https://www.google.com',
      description: description,
      customer: {
        id: 'customer_123',
        name: 'John Doe',
        email: 'customer@example.com',
      },
      billing: {
        address: {
          line1: '1467',
          line2: 'Harrison Street',
          city: 'San Fransico',
          state: 'California',
          zip: '94122',
          country: 'US',
        },
      },
    };

    console.log('Creating payment link...');

    const response = await fetch(`${creds.serverUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
      },
      body: JSON.stringify(paymentData),
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Hyperswitch error:', data.error);
      return res.status(400).json({ error: data.error });
    }

    res.json({
      payment_id: data.payment_id,
      status: data.status,
      payment_link: data.payment_link,
    });
  } catch (error) {
    console.error('Error creating payment link:', error);
    res.status(500).json({ error: error.message });
  }
});

// Disputes - List endpoint
app.get('/api/list-disputes', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    console.log('Fetching disputes list...');

    const response = await fetch(`${creds.serverUrl}/disputes/list`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
      },
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Hyperswitch error:', data.error);
      return res.status(400).json({ error: data.error });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching disputes:', error);
    res.status(500).json({ error: error.message });
  }
});

// HS SDK + External Vault Storage endpoint
app.post('/api/create-external-vault-payment', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const { amount = 10000, currency = 'USD', description = 'Default value' } = req.body;

    // Use external vault profile ID for non-debug mode, or debug profile_id if in debug mode
    const profileId = creds.isDebugMode 
      ? creds.profileId
      : 'pro_ukJVFiPH0bzYFZwBPi9j';

    const paymentData = {
      amount: amount,
      currency: currency,
      profile_id: profileId,
      customer_id: 'hyperswitch_sdk_demo_id',
      description: description,
      capture_method: 'automatic',
      email: 'guest@example.com',
      setup_future_usage: 'on_session',
      request_external_three_ds_authentication: false,
      billing: {
        address: {
          line1: '1600',
          line2: 'Amphitheatre Parkway',
          city: 'Mountain View',
          state: 'California',
          zip: '94043',
          country: 'US',
          first_name: 'John',
          last_name: 'Doe',
        },
        phone: {
          number: '6502530000',
          country_code: '+1',
        },
      },
      shipping: {
        address: {
          line1: '1600',
          line2: 'Amphitheatre Parkway',
          city: 'Mountain View',
          state: 'California',
          zip: '94043',
          country: 'US',
          first_name: 'John',
          last_name: 'Doe',
        },
        phone: {
          number: '6502530000',
          country_code: '+1',
        },
      },
    };

    console.log('Creating payment with external vault...');

    const response = await fetch(`${creds.serverUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
        'X-Profile-Id': profileId,
      },
      body: JSON.stringify(paymentData),
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Hyperswitch error:', data.error);
      return res.status(400).json({ error: data.error });
    }

    res.json({
      payment_id: data.payment_id,
      status: data.status,
      client_secret: data.client_secret,
      amount: data.amount,
      currency: data.currency,
    });
  } catch (error) {
    console.error('Error creating external vault payment:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DECISION ENGINE PROXY ENDPOINTS
// ============================================

// Decision Engine - Gateway decision evaluate
app.post('/api/de-proxy/routing/evaluate', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const baseUrl = req.headers['x-base-url'] || creds.serverUrl || process.env.HYPERSWITCH_BASE_URL || 'https://sandbox.hyperswitch.io';
    const profileId = req.headers['x-profile-id'] || creds.profileId;
    
    console.log('DE Proxy: Routing evaluate');

    const response = await fetch(`${baseUrl}/routing/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
        ...(profileId && { 'X-Profile-Id': profileId }),
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Hyperswitch DE error:', data.error);
      return res.status(response.status).json({ error: data.error });
    }

    res.json(data);
  } catch (error) {
    console.error('Error in DE routing evaluate:', error);
    res.status(500).json({ error: error.message });
  }
});

// Decision Engine - Update success rate window feedback
app.post('/api/de-proxy/routing/feedback', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const baseUrl = req.headers['x-base-url'] || creds.serverUrl || process.env.HYPERSWITCH_BASE_URL || 'https://sandbox.hyperswitch.io';
    const profileId = req.headers['x-profile-id'] || creds.profileId;
    
    console.log('DE Proxy: Routing feedback');

    const response = await fetch(`${baseUrl}/routing/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
        ...(profileId && { 'X-Profile-Id': profileId }),
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Hyperswitch DE error:', data.error);
      return res.status(response.status).json({ error: data.error });
    }

    res.json(data);
  } catch (error) {
    console.error('Error in DE routing feedback:', error);
    res.status(500).json({ error: error.message });
  }
});

// Decision Engine - Activate routing algorithm
app.post('/api/de-proxy/routing/:id/activate', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const baseUrl = req.headers['x-base-url'] || creds.serverUrl || process.env.HYPERSWITCH_BASE_URL || 'https://sandbox.hyperswitch.io';
    const profileId = req.headers['x-profile-id'] || creds.profileId;
    const { id } = req.params;
    
    console.log('DE Proxy: Activate routing algorithm', id);

    const response = await fetch(`${baseUrl}/routing/${id}/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
        ...(profileId && { 'X-Profile-Id': profileId }),
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Hyperswitch DE error:', data.error);
      return res.status(response.status).json({ error: data.error });
    }

    res.json(data);
  } catch (error) {
    console.error('Error in DE routing activate:', error);
    res.status(500).json({ error: error.message });
  }
});

// Decision Engine - Fetch connectors
app.get('/api/de-proxy/account/:merchantId/profile/connectors', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const baseUrl = req.headers['x-base-url'] || creds.serverUrl || process.env.HYPERSWITCH_BASE_URL || 'https://sandbox.hyperswitch.io';
    const profileId = req.headers['x-profile-id'] || creds.profileId;
    const { merchantId } = req.params;
    
    console.log('DE Proxy: Fetch connectors for merchant', merchantId);

    const response = await fetch(`${baseUrl}/account/${merchantId}/profile/connectors`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
        ...(profileId && { 'X-Profile-Id': profileId }),
      },
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Hyperswitch DE error:', data.error);
      return res.status(response.status).json({ error: data.error });
    }

    res.json(data);
  } catch (error) {
    console.error('Error in DE fetch connectors:', error);
    res.status(500).json({ error: error.message });
  }
});

// Decision Engine - Update SR config
app.patch('/api/de-proxy/account/:merchantId/business_profile/:profileId/dynamic_routing/success_based/config/:routingId', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const baseUrl = req.headers['x-base-url'] || creds.serverUrl || process.env.HYPERSWITCH_BASE_URL || 'https://sandbox.hyperswitch.io';
    const headerProfileId = req.headers['x-profile-id'] || creds.profileId;
    const { merchantId, profileId, routingId } = req.params;
    
    console.log('DE Proxy: Update SR config', { merchantId, profileId, routingId });

    const response = await fetch(`${baseUrl}/account/${merchantId}/business_profile/${profileId}/dynamic_routing/success_based/config/${routingId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
        ...(headerProfileId && { 'X-Profile-Id': headerProfileId }),
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Hyperswitch DE error:', data.error);
      return res.status(response.status).json({ error: data.error });
    }

    res.json(data);
  } catch (error) {
    console.error('Error in DE update SR config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Decision Engine - Toggle SBR
app.post('/api/de-proxy/account/:merchantId/business_profile/:profileId/dynamic_routing/success_based/toggle', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const baseUrl = req.headers['x-base-url'] || creds.serverUrl || process.env.HYPERSWITCH_BASE_URL || 'https://sandbox.hyperswitch.io';
    const headerProfileId = req.headers['x-profile-id'] || creds.profileId;
    const { merchantId, profileId } = req.params;
    
    console.log('DE Proxy: Toggle SBR', { merchantId, profileId });

    const response = await fetch(`${baseUrl}/account/${merchantId}/business_profile/${profileId}/dynamic_routing/success_based/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
        ...(headerProfileId && { 'X-Profile-Id': headerProfileId }),
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Hyperswitch DE error:', data.error);
      return res.status(response.status).json({ error: data.error });
    }

    res.json(data);
  } catch (error) {
    console.error('Error in DE toggle SBR:', error);
    res.status(500).json({ error: error.message });
  }
});

// Decision Engine - Set volume split
app.post('/api/de-proxy/account/:merchantId/business_profile/:profileId/dynamic_routing/set_volume_split', async (req, res) => {
  try {
    const creds = getCredentials(req);
    
    if (creds.isDebugMode && !creds.secretKey) {
      return res.status(400).json({ error: 'Debug credentials not provided' });
    }
    
    const baseUrl = req.headers['x-base-url'] || creds.serverUrl || process.env.HYPERSWITCH_BASE_URL || 'https://sandbox.hyperswitch.io';
    const headerProfileId = req.headers['x-profile-id'] || creds.profileId;
    const { merchantId, profileId } = req.params;
    
    console.log('DE Proxy: Set volume split', { merchantId, profileId });

    const response = await fetch(`${baseUrl}/account/${merchantId}/business_profile/${profileId}/dynamic_routing/set_volume_split`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
        ...(headerProfileId && { 'X-Profile-Id': headerProfileId }),
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Hyperswitch DE error:', data.error);
      return res.status(response.status).json({ error: data.error });
    }

    res.json(data);
  } catch (error) {
    console.error('Error in DE set volume split:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/3ds-decision-rules', async (req, res) => {
  const creds = getCredentials(req);
  
  if (!creds || !creds.secretKey) {
    return res.status(401).json({ error: 'Credentials not configured' });
  }
  
  try {
    const url = `${creds.serverUrl}/routing/active?transaction_type=three_ds_authentication&limit=100`;
    
    console.log('Fetching 3DS decision rules from:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'api-key': creds.secretKey,
        ...(creds.profileId && { 'X-Profile-Id': creds.profileId }),
      },
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.error('Hyperswitch 3DS rules error:', data.error);
      return res.status(response.status).json({ error: data.error });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching 3DS decision rules:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/3ds-decision-rules/:id', async (req, res) => {
  const creds = getCredentials(req);
  const { id } = req.params;
  
  if (!creds || !creds.secretKey) {
    return res.status(401).json({ error: 'Credentials not configured' });
  }
  
  try {
    const url = `${creds.serverUrl}/routing/${id}`;
    
    console.log('Fetching 3DS decision rule:', id);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'api-key': creds.secretKey,
        ...(creds.profileId && { 'X-Profile-Id': creds.profileId }),
      },
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.error('Hyperswitch 3DS rule error:', data.error);
      return res.status(response.status).json({ error: data.error });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching 3DS decision rule:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/3ds-decision-rules', async (req, res) => {
  const creds = getCredentials(req);
  
  if (!creds || !creds.secretKey) {
    return res.status(401).json({ error: 'Credentials not configured' });
  }
  
  try {
    const url = `${creds.serverUrl}/routing`;
    
    const ruleData = {
      ...req.body,
      transaction_type: 'three_ds_authentication',
      algorithm: {
        type: 'three_ds_decision_rule',
        data: req.body.algorithm?.data || {
          defaultSelection: { decision: 'no_three_ds' },
          rules: [],
          metadata: {}
        }
      }
    };
    
    console.log('Creating 3DS decision rule:', ruleData.name);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
        ...(creds.profileId && { 'X-Profile-Id': creds.profileId }),
      },
      body: JSON.stringify(ruleData),
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.error('Hyperswitch create 3DS rule error:', data.error);
      return res.status(response.status).json({ error: data.error });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error creating 3DS decision rule:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/3ds-decision-rules/:id/activate', async (req, res) => {
  const creds = getCredentials(req);
  const { id } = req.params;
  
  if (!creds || !creds.secretKey) {
    return res.status(401).json({ error: 'Credentials not configured' });
  }
  
  try {
    const url = `${creds.serverUrl}/routing/${id}/activate`;
    
    console.log('Activating 3DS decision rule:', id);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
        ...(creds.profileId && { 'X-Profile-Id': creds.profileId }),
      },
      body: JSON.stringify({}),
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.error('Hyperswitch activate 3DS rule error:', data.error);
      return res.status(response.status).json({ error: data.error });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error activating 3DS decision rule:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/3ds-decision-rules/:id/deactivate', async (req, res) => {
  const creds = getCredentials(req);
  const { id } = req.params;
  
  if (!creds || !creds.secretKey) {
    return res.status(401).json({ error: 'Credentials not configured' });
  }
  
  try {
    const url = `${creds.serverUrl}/routing/deactivate`;
    
    console.log('Deactivating 3DS decision rule:', id);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': creds.secretKey,
        ...(creds.profileId && { 'X-Profile-Id': creds.profileId }),
      },
      body: JSON.stringify({ routing_id: id }),
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.error('Hyperswitch deactivate 3DS rule error:', data.error);
      return res.status(response.status).json({ error: data.error });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error deactivating 3DS decision rule:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/3ds-decision-rules/test', async (req, res) => {
  const creds = getCredentials(req);
  
  if (!creds || !creds.secretKey) {
    return res.status(401).json({ error: 'Credentials not configured' });
  }
  
  try {
    const { rules, testTransaction } = req.body;
    
    console.log('Testing 3DS decision rules:', rules.length, 'rules');
    let finalDecision = 'no_three_ds';
    let matchedRule = null;
    
    for (const rule of rules) {
      if (!rule.enabled) continue;
      
      let ruleMatched = true;
      let firstCondition = true;
      
      for (const condition of rule.conditions) {
        const txValue = testTransaction[condition.field];
        let conditionMatched = false;
        
        switch (condition.operator) {
          case 'EQUAL_TO':
            conditionMatched = txValue == condition.value;
            break;
          case 'GREATER_THAN':
            conditionMatched = parseFloat(txValue) > parseFloat(condition.value);
            break;
          case 'LESS_THAN':
            conditionMatched = parseFloat(txValue) < parseFloat(condition.value);
            break;
          case 'IS':
            conditionMatched = txValue === condition.value;
            break;
          case 'IS_NOT':
            conditionMatched = txValue !== condition.value;
            break;
          case 'CONTAINS':
            conditionMatched = String(txValue).includes(condition.value);
            break;
          case 'NOT_CONTAINS':
            conditionMatched = !String(txValue).includes(condition.value);
            break;
          default:
            conditionMatched = txValue == condition.value;
        }
        
        if (firstCondition) {
          ruleMatched = conditionMatched;
          firstCondition = false;
        } else if (condition.logicalOperator === 'AND') {
          ruleMatched = ruleMatched && conditionMatched;
        } else if (condition.logicalOperator === 'OR') {
          ruleMatched = ruleMatched || conditionMatched;
        }
      }
      
      if (ruleMatched) {
        finalDecision = rule.decision;
        matchedRule = rule.name;
        break;
      }
    }
    
    res.json({
      decision: finalDecision,
      matchedRule,
      testTransaction,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error testing 3DS decision rules:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/create-split-payment', async (req, res) => {
  try {
    const { 
      amount, 
      currency = 'USD', 
      routing,
      split_payments,
      description
    } = req.body;
    
    // Split Settlement uses a specific profile for Stripe Connect
    const SPLIT_SETTLEMENT_PROFILE_ID = 'pro_ukJVFiPH0bzYFZwBPi9j';
    
    const paymentData = {
      amount: amount,
      currency: currency,
      confirm: false,
      capture_method: 'automatic',
      description: description || 'Split Settlement Payment',
      profile_id: SPLIT_SETTLEMENT_PROFILE_ID,
      routing: routing || { type: 'single', data: 'stripe' },
      split_payments: split_payments
    };

    const response = await fetch(`${process.env.HYPERSWITCH_SERVER_URL}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': process.env.HYPERSWITCH_SECRET_KEY,
      },
      body: JSON.stringify(paymentData),
    });

    const data = await response.json();
    
    if (data.error) {
      return res.status(400).json({ error: data.error });
    }

    res.json({
      client_secret: data.client_secret,
      payment_id: data.payment_id,
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      connector: data.connector,
      split_payments: data.split_payments,
      profile_id: data.profile_id
    });
  } catch (error) {
    console.error('Error creating split payment:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const clientDistPath = path.join(__dirname, '../client/dist');
const fs = require('fs');

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.use((req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
