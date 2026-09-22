import React, { useEffect, useState } from 'react';
import Layout from './components/Layout';
import PaymentForm from './components/PaymentForm';
import APIResponsePanel from './components/APIResponsePanel';
import RecurringCharge from './flows/RecurringCharge';
import RecurringChargeNTID from './flows/RecurringChargeNTID';
import RecurringChargePSP from './flows/RecurringChargePSP';
import AccountUpdater from './flows/AccountUpdater';
import Readme from './flows/Readme';
import Import3DSResults from './flows/Import3DSResults';
import Standalone3DS from './flows/Standalone3DS';
import PaymentLinks from './flows/PaymentLinks';
import ChargebackUnification from './flows/ChargebackUnification';
import HSSDKExternalVault from './flows/HSSDKExternalVault';
import RelayCapture from './flows/RelayCapture';
import RelayRefund from './flows/RelayRefund';
import RelayVoid from './flows/RelayVoid';
import RelayIncrementalAuth from './flows/RelayIncrementalAuth';
import SmartRetry from './flows/SmartRetry';
import RoutingSimulator from './flows/routing/RoutingSimulator';
import ThreeDSDecisionManager from './flows/ThreeDSDecisionManager';
import OrganizationManager from './flows/OrganizationManager';
import DecisionEnginePlayground from './flows/decision-engine/DecisionEnginePlayground';
import SDKCustomization from './flows/SDKCustomization';
import SplitSettlement from './flows/SplitSettlement';
import EmbeddedComponents from './flows/embedded-components/EmbeddedComponents';
import RevenueRecoveryIntegrations from './flows/revenue-recovery/Integrations';
import RevenueRecoverySimulator from './flows/revenue-recovery/RecoverySimulator';
import { useRecoilState, useRecoilValue } from 'recoil';
import { currentFlowState, apiResponseState, hyperState, themeState } from './utils/atoms';
import API_BASE_URL from './config';

const App = () => {
  const [currentFlow, setCurrentFlow] = useRecoilState(currentFlowState);
  const [apiResponse, setApiResponse] = useRecoilState(apiResponseState);
  const [hyper, setHyper] = useRecoilState(hyperState);
  const theme = useRecoilValue(themeState);
  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [initError, setInitError] = useState(null);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const flowId = urlParams.get('flow');
    
    if (flowId) {
      // Find the flow in sidebar data
      const allFlows = [
        { id: 'readme', name: 'Readme', description: 'Overview of all demo app sections' },
        { id: 'automatic', name: 'Automatic Capture', description: 'Standard one-time payment' },
        { id: 'manual', name: 'Manual Capture', description: 'Authorize now, capture later' },
        { id: 'manual_partial', name: 'Manual Partial Capture', description: 'Capture $50 of $100 authorized' },
        { id: 'repeat_user', name: 'Repeat User', description: 'Use saved customer ID' },
        { id: 'payment_links', name: 'Payment Links', description: 'Generate shareable payment links' },
        { id: 'split_settlement', name: 'Split Settlement', description: 'Distribute funds between accounts with Stripe Connect' },
        { id: 'zero_setup', name: '$0 Setup Recurring', description: 'Setup recurring with $0 authorization' },
        { id: 'setup_and_charge', name: 'Setup Recurring and Charge', description: 'Charge $100 and setup recurring' },
        { id: 'recurring_charge', name: 'Recurring Charge', description: 'Charge using saved payment method' },
        { id: 'recurring_charge_ntid', name: 'Recurring Charge with Network Transaction ID', description: 'Charge using NTID with card entry' },
        { id: 'recurring_charge_psp', name: 'Recurring Charge with PSP Token', description: 'Charge using PSP mandate token' },
        { id: 'account_updater', name: 'Account Updater', description: 'Save a card, charge it off-session later, see the refreshed card details' },
        { id: 'three_ds_psp', name: 'Authenticate with 3DS via PSP', description: '3D Secure authentication via PSP' },
        { id: 'three_ds_import', name: 'Import 3D Secure Results', description: 'Import existing 3DS authentication' },
        { id: 'three_ds_standalone', name: 'Standalone 3D Secure', description: 'Standalone 3DS via Hyperswitch' },
        { id: 'frm_pre', name: 'FRM Pre-Auth', description: 'Fraud check before authorization' },
        { id: 'chargeback_unification', name: 'Chargeback Unification', description: 'List and manage disputes' },
        { id: 'relay_capture', name: 'Relay - Capture', description: 'Capture via relay API' },
        { id: 'relay_refund', name: 'Relay - Refund', description: 'Refund via relay API' },
        { id: 'relay_void', name: 'Relay - Void', description: 'Void via relay API' },
        { id: 'relay_incremental', name: 'Relay - Incremental Auth', description: 'Incremental authorization via relay' },
        { id: 'vault_3', name: 'HS managed SDK + External Vaulting', description: 'Hyperswitch vault SDK with external storage' },
        { id: 'vault_5', name: 'Integrated Third-Party Vaulting', description: 'External vault in HS SDK with external storage' },
        { id: 'vault_4', name: 'Standalone Third-Party Vaulting', description: 'External vault SDK with Hyperswitch' },
        { id: 'vault_1', name: 'HS managed SDK & Vault with Proxy', description: 'Hyperswitch vault with PSP payload' },
        { id: 'vault_2', name: 'HS managed SDK & Vault with Unified payments', description: 'Hyperswitch vault with unified payload' },
        { id: 'smart_retry_playground', name: 'Smart Retry Playground', description: 'Simulate intelligent retry strategies' },
        { id: 'revenue_recovery_integrations', name: 'Integrations', description: 'Configure and manage integrations for revenue recovery' },
        { id: 'revenue_recovery_simulator', name: 'Recovery Simulator', description: 'Simulate recovery scenarios and visualize dunning strategies' },
        { id: 'routing_simulator', name: 'Routing Simulator', description: 'Watch transactions flow through eligibility, rules, and overrides' },
        { id: 'three_ds_decision', name: '3DS Decision Manager', description: 'Risk-based 3DS authentication decisions' },
        { id: 'organization_manager', name: 'Organization Manager', description: 'Mock organization structure and merchant management' },
        { id: 'decision_engine', name: 'Decision Engine', description: 'Success rate-based dynamic routing simulation' },
        { id: 'sdk_customization', name: 'SDK Customization', description: 'Customize checkout appearance, layout, and behavior' },
        { id: 'embedded_components', name: 'Connectors Onboarding', description: 'Hyperswitch dashboard components embedded via the embeddable SDK' },
      ];
      
      const flow = allFlows.find(f => f.id === flowId);
      if (flow) {
        setCurrentFlow(flow);
      }
    }
  }, [setCurrentFlow]);

  // Load HyperLoader and initialize
  useEffect(() => {
    // Skip HyperLoader for flows that don't depend on window.Hyper
    const flowId = new URLSearchParams(window.location.search).get('flow');
    if (flowId === 'embedded_components' || flowId === 'account_updater') {
      setIsLoading(false);
      return;
    }

    const loadHyper = async () => {
      try {
        console.log('Fetching config and URLs...');
        // Fetch config and URLs
        const [configRes, urlsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/config`),
          fetch(`${API_BASE_URL}/urls`),
        ]);

        const configData = await configRes.json();
        const urlsData = await urlsRes.json();
        console.log('Config loaded:', configData);
        console.log('URLs loaded:', urlsData);
        setConfig(configData);

        // Load HyperLoader script
        const script = document.createElement('script');
        script.src = `${urlsData.clientUrl}/HyperLoader.js`;
        script.async = true;

        script.onload = () => {
          console.log('HyperLoader loaded, checking window.Hyper...');
          console.log('window.Hyper available:', !!window.Hyper);
          
          if (!window.Hyper) {
            console.error('window.Hyper not available after script load');
            setInitError('Hyperswitch SDK (window.Hyper) not loaded. The SDK script loaded but did not initialize.');
            setIsLoading(false);
            return;
          }
          
          try {
            console.log('Creating Hyper instance with:', {
              publishableKey: configData.publishableKey,
              profileId: configData.profileId,
              customBackendUrl: urlsData.serverUrl
            });
            
            const hyperInstance = window.Hyper(
              {
                publishableKey: configData.publishableKey,
                profileId: configData.profileId,
              },
              {
                customBackendUrl: urlsData.serverUrl,
              }
            );
            
            console.log('Hyper instance created successfully');
            setHyper(hyperInstance);
            setIsLoading(false);
          } catch (err) {
            console.error('Error creating Hyper instance:', err);
            setInitError('Error initializing Hyperswitch: ' + err.message);
            setIsLoading(false);
          }
        };

        script.onerror = (e) => {
          console.error('Failed to load HyperLoader:', e);
          setInitError('Failed to load Hyperswitch SDK');
          setIsLoading(false);
        };

        document.head.appendChild(script);
      } catch (error) {
        console.error('Error initializing:', error);
        setInitError(error.message);
        setIsLoading(false);
      }
    };

    loadHyper();
  }, [setHyper]);

  const handleFlowSelect = (flow) => {
    setCurrentFlow(flow);
    setApiResponse({ steps: [], currentStep: 0 });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <div className="text-lg text-gray-600 dark:text-gray-300">Loading Hyperswitch SDK...</div>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-8">
        <div className="text-red-600 text-xl mb-4">⚠️ Initialization Error</div>
        <div className="text-gray-700 dark:text-gray-300 text-center max-w-md">
          {initError}
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="mt-6 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <Layout onFlowSelect={handleFlowSelect} currentFlow={currentFlow}>
      {currentFlow?.id === 'readme' || currentFlow?.id === 'organization_manager' || currentFlow?.id === 'decision_engine' || currentFlow?.id === 'sdk_customization' || currentFlow?.id === 'embedded_components' ? (
        <div className="w-full">
          {currentFlow.id === 'readme' ? (
            <Readme key={currentFlow.id} />
          ) : currentFlow.id === 'organization_manager' ? (
            <OrganizationManager key={currentFlow.id} />
          ) : currentFlow.id === 'decision_engine' ? (
            <DecisionEnginePlayground key={currentFlow.id} />
          ) : currentFlow.id === 'embedded_components' ? (
            <EmbeddedComponents key={currentFlow.id} />
          ) : (
            <SDKCustomization key={currentFlow.id} hyper={hyper} />
          )}
        </div>
      ) : (
        <div className={`${currentFlow?.id === 'routing_simulator' || currentFlow?.id === 'three_ds_decision' || currentFlow?.id === 'revenue_recovery_simulator' || currentFlow?.id === 'revenue_recovery_integrations' ? (currentFlow?.id === 'revenue_recovery_integrations' ? 'max-w-[1456px]' : 'max-w-7xl') : 'max-w-4xl'} mx-auto w-full px-2 sm:px-0 overflow-x-hidden ${currentFlow?.id === 'revenue_recovery_integrations' ? 'flex-1 flex flex-col overflow-hidden min-h-0' : ''}`}>
          <div className={`mb-6 ${currentFlow?.id === 'revenue_recovery_integrations' ? 'flex-shrink-0' : ''}`}>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {currentFlow?.name || 'Select a Flow'}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {currentFlow?.description || 'Choose a payment flow from the sidebar to begin'}
            </p>
          </div>

          {currentFlow && (
            <>
              <div
                className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6 mb-6 overflow-hidden ${currentFlow.id === 'chargeback_unification' || currentFlow.id === 'routing_simulator' || currentFlow.id === 'three_ds_decision' || currentFlow.id === 'revenue_recovery_simulator' || currentFlow.id === 'revenue_recovery_integrations' ? 'w-full max-w-none' : 'max-w-2xl mx-auto w-full'} ${currentFlow.id === 'revenue_recovery_integrations' ? 'flex flex-col flex-1 min-h-0' : ''}`}
              >
              {currentFlow.id === 'recurring_charge' ? (
                <RecurringCharge key={currentFlow.id} />
              ) : currentFlow.id === 'recurring_charge_ntid' ? (
                <RecurringChargeNTID key={currentFlow.id} />
              ) : currentFlow.id === 'recurring_charge_psp' ? (
                <RecurringChargePSP key={currentFlow.id} />
              ) : currentFlow.id === 'account_updater' ? (
                <AccountUpdater key={currentFlow.id} />
              ) : currentFlow.id === 'three_ds_import' ? (
                <Import3DSResults key={currentFlow.id} />
              ) : currentFlow.id === 'three_ds_standalone' ? (
                <Standalone3DS key={currentFlow.id} />
              ) : currentFlow.id === 'payment_links' ? (
                <PaymentLinks key={currentFlow.id} />
              ) : currentFlow.id === 'split_settlement' ? (
                <SplitSettlement key={currentFlow.id} flow={currentFlow} />
              ) : currentFlow.id === 'chargeback_unification' ? (
                <ChargebackUnification key={currentFlow.id} />
              ) : currentFlow.id === 'relay_capture' ? (
                <RelayCapture key={currentFlow.id} />
              ) : currentFlow.id === 'relay_refund' ? (
                <RelayRefund key={currentFlow.id} />
              ) : currentFlow.id === 'relay_void' ? (
                <RelayVoid key={currentFlow.id} />
              ) : currentFlow.id === 'relay_incremental' ? (
                <RelayIncrementalAuth key={currentFlow.id} />
              ) : currentFlow.id === 'smart_retry_playground' ? (
                <SmartRetry key={currentFlow.id} />
              ) : currentFlow.id === 'revenue_recovery_integrations' ? (
                <RevenueRecoveryIntegrations key={currentFlow.id} />
              ) : currentFlow.id === 'revenue_recovery_simulator' ? (
                <RevenueRecoverySimulator key={currentFlow.id} />
              ) : currentFlow.id === 'routing_simulator' ? (
                <RoutingSimulator key={currentFlow.id} />
              ) : currentFlow.id === 'three_ds_decision' ? (
                <ThreeDSDecisionManager key={currentFlow.id} />
              ) : currentFlow.id === 'organization_manager' ? (
                <OrganizationManager key={currentFlow.id} />
              ) : currentFlow.id === 'decision_engine' ? (
                <DecisionEnginePlayground key={currentFlow.id} />
              ) : currentFlow.id === 'sdk_customization' ? (
                <SDKCustomization key={currentFlow.id} />
              ) : currentFlow.id === 'readme' ? (
                <Readme key={currentFlow.id} />
              ) : (
                <PaymentForm key={currentFlow.id} flow={currentFlow} />
              )}
            </div>

            {currentFlow.id !== 'smart_retry_playground' && currentFlow.id !== 'routing_simulator' && currentFlow.id !== 'three_ds_decision' && currentFlow.id !== 'sdk_customization' && currentFlow.id !== 'revenue_recovery_integrations' && currentFlow.id !== 'revenue_recovery_simulator' && (
              <div className="max-w-7xl mx-auto">
                <APIResponsePanel />
              </div>
            )}
          </>
        )}

        {!currentFlow && <Readme />}
      </div>
      )}
    </Layout>
  );
};

export default App;
