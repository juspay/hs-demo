import React, { useEffect, useRef, useState } from 'react';
import { useSetRecoilState } from 'recoil';
import { apiResponseState } from '../utils/atoms';

// Fully scripted, client-side demo - no server or Hyperswitch API calls.
// Built for the sales team to show what Account Updater enables without
// depending on live sandbox credentials, connectors, or card entry.

const CUSTOMER_ID = 'cus_demo_account_updater';
const PROFILE_ID = 'pro_demo9f21ac04b3';
const AMOUNT = 10000;
const CURRENCY = 'USD';

const SCENARIOS = [
  {
    id: 'account_updated',
    label: 'Mastercard: Account Updated',
    network: 'Mastercard',
    paymentMethodId: 'pm_7f3ac2e1b7d84c1a',
    citPaymentId: 'pay_9f3ac2e1b7d84c1a',
    mitPaymentId: 'pay_2c88a10f45b6e9d3',
    networkTransactionId: '618469555279852',
    cardType: 'CREDIT',
    cardIssuer: 'CAPITAL ONE',
    cardIssuingCountry: 'UNITEDSTATES',
    before: { last4: '0005', expMonth: '12', expYear: '2028' },
    after: { last4: '4000', expMonth: '06', expYear: '2030' },
    updaterName: 'Mastercard Automatic Billing Updater (ABU)',
    outcomeTitle: 'Account Updated',
    outcomeDesc: 'The issuer replaced the card entirely. Mastercard’s network returned a brand-new card number and expiry under the same payment method id, and the merchant never needed to ask the customer for either.',
  },
  {
    id: 'expiry_updated',
    label: 'Visa: Expiry Updated',
    network: 'Visa',
    paymentMethodId: 'pm_a184e6c02f5b91da',
    citPaymentId: 'pay_a184e6c02f5b91da',
    mitPaymentId: 'pay_5e01d9c3b7a24f88',
    networkTransactionId: '502938471029384',
    cardType: 'CREDIT',
    cardIssuer: 'CHASE BANK',
    cardIssuingCountry: 'UNITEDSTATES',
    before: { last4: '0727', expMonth: '08', expYear: '2027' },
    after: { last4: '0727', expMonth: '08', expYear: '2030' },
    updaterName: 'Visa Account Updater (VAU)',
    outcomeTitle: 'Expiry Updated',
    outcomeDesc: 'Same card number, refreshed expiry date. Visa’s network returned the new expiry before the connector was ever called, so the off-session charge went through without a decline.',
  },
];

const cardObject = (s, cardState) => ({
  last4: cardState.last4,
  card_type: s.cardType,
  card_network: s.network,
  card_issuer: s.cardIssuer,
  card_issuing_country: s.cardIssuingCountry,
  card_exp_month: cardState.expMonth,
  card_exp_year: cardState.expYear,
  card_holder_name: 'Jane Doe',
});

const buildCitResponse = (s) => ({
  payment_id: s.citPaymentId,
  status: 'succeeded',
  amount: AMOUNT,
  net_amount: AMOUNT,
  amount_received: AMOUNT,
  connector: 'checkout',
  currency: CURRENCY,
  customer_id: CUSTOMER_ID,
  payment_method: 'card',
  payment_method_data: { card: cardObject(s, s.before) },
  payment_method_id: s.paymentMethodId,
  payment_method_status: 'active',
  is_stored_credential: true,
});

const buildMitResponse = (s) => ({
  payment_id: s.mitPaymentId,
  status: 'succeeded',
  amount: AMOUNT,
  net_amount: AMOUNT,
  amount_received: AMOUNT,
  connector: 'checkout',
  currency: CURRENCY,
  customer_id: CUSTOMER_ID,
  off_session: true,
  payment_method: 'card',
  payment_method_data: { card: cardObject(s, s.after) },
  payment_method_id: s.paymentMethodId,
  network_transaction_id: s.networkTransactionId,
  payment_method_status: 'active',
  is_stored_credential: true,
  payment_method_tokenization_details: {
    payment_method_id: s.paymentMethodId,
    payment_method_status: 'active',
    psp_tokenization: false,
    network_tokenization: false,
    network_transaction_id: s.networkTransactionId,
    is_eligible_for_mit_payment: true,
  },
});

const refreshStepsFor = (s) => [
  'Fetching stored payment method…',
  'Checking eligibility (network, BIN, profile flags)…',
  `Querying ${s.updaterName}…`,
  'Applying refreshed card details…',
];

const STAGE_STEP = { idle: 0, saving: 0, saved: 1, charging: 2, done: 3 };
const STEP_LABELS = ['Save Card', 'Card Goes Stale', 'Trigger MIT', 'Refreshed'];

const Stepper = ({ stage }) => {
  const current = STAGE_STEP[stage];
  return (
    <div className="flex items-center">
      {STEP_LABELS.map((label, i) => (
        <React.Fragment key={label}>
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                i < current
                  ? 'bg-green-500 text-white'
                  : i === current
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 border border-gray-200 dark:border-gray-700'
              }`}
            >
              {i < current ? '✓' : i + 1}
            </div>
            <span className={`text-[11px] font-medium hidden sm:block ${i <= current ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>
              {label}
            </span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div className={`flex-1 h-0.5 mx-1 sm:mx-2 -mt-4 ${i < current ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// Small CSS-only logo lookalikes - close enough for a demo, no image assets needed.
const NetworkMark = ({ network, size = 'md' }) => {
  const dims = size === 'sm' ? 'w-7 h-4' : 'w-9 h-6';
  if (network === 'Mastercard') {
    return (
      <div className={`relative ${dims} flex items-center justify-center shrink-0`}>
        <div className="absolute left-0 h-full aspect-square rounded-full bg-[#EB001B]" />
        <div className="absolute right-0 h-full aspect-square rounded-full bg-[#F79E1B] mix-blend-multiply" />
      </div>
    );
  }
  return (
    <div className={`${dims} flex items-center justify-center shrink-0`}>
      <span className="text-[#1A1F71] dark:text-[#5b6ee8] font-black italic text-sm tracking-tighter">VISA</span>
    </div>
  );
};

// Looks like the real Hyperswitch Payment Element's saved-card row.
const PaymentElementMock = ({ scenario }) => (
  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5 shadow-sm">
    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Card Details</p>
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-gray-800">
        <span className="h-4 w-4 rounded-full border-2 border-primary flex items-center justify-center shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        <NetworkMark network={scenario.network} />
        <span className="font-mono text-sm text-gray-700 dark:text-gray-200 tracking-widest">
          •••• {scenario.before.last4}
        </span>
        <span className="ml-auto text-sm text-gray-400 dark:text-gray-500">
          {scenario.before.expMonth} / {scenario.before.expYear.slice(-2)}
        </span>
      </div>
    </div>
    <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
      powered by <span className="font-semibold text-gray-500 dark:text-gray-400">hyperswitch</span>
    </p>
  </div>
);

const CardFace = ({ label, network, card, highlight }) => (
  <div className={`flex-1 rounded-xl p-4 border ${highlight ? 'border-primary ring-2 ring-primary/30' : 'border-gray-200 dark:border-gray-700'} bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900`}>
    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">{label}</p>
    <div className="flex items-center justify-between mb-6">
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{network}</span>
      <NetworkMark network={network} />
    </div>
    <p className="text-lg font-mono tracking-widest text-gray-800 dark:text-gray-100 mb-3">
      •••• •••• •••• {card.last4}
    </p>
    <p className="text-sm text-gray-500 dark:text-gray-400">Exp {card.expMonth}/{card.expYear}</p>
  </div>
);

const AccountUpdater = () => {
  const setApiResponse = useSetRecoilState(apiResponseState);

  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [stage, setStage] = useState('idle'); // idle -> saving -> saved -> charging -> done
  const [refreshStepIndex, setRefreshStepIndex] = useState(0);

  const timers = useRef([]);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => () => clearTimers(), []);

  const scenario = SCENARIOS.find((s) => s.id === scenarioId) || SCENARIOS[0];

  const resetTo = (id) => {
    clearTimers();
    setScenarioId(id);
    setStage('idle');
    setRefreshStepIndex(0);
    setApiResponse({ steps: [], currentStep: 0 });
  };

  const handleSaveCard = () => {
    setStage('saving');
    const t = setTimeout(() => {
      setStage('saved');
      setApiResponse({
        steps: [
          {
            title: 'Step 1: Save Card — Create CIT',
            request: {
              method: 'POST',
              url: '/payments',
              body: {
                amount: AMOUNT,
                currency: CURRENCY,
                confirm: false,
                profile_id: PROFILE_ID,
                customer_id: CUSTOMER_ID,
                capture_method: 'automatic',
                authentication_type: 'no_three_ds',
                setup_future_usage: 'off_session',
                return_url: 'https://merchant.example.com/return',
              },
            },
            response: { payment_id: scenario.citPaymentId, status: 'requires_payment_method' },
          },
          {
            title: 'Step 2: Save Card — Confirm CIT',
            request: {
              method: 'POST',
              url: `/payments/${scenario.citPaymentId}/confirm`,
              body: {
                payment_method: 'card',
                payment_method_data: {
                  card: {
                    card_number: `•••• •••• •••• ${scenario.before.last4}`,
                    card_exp_month: scenario.before.expMonth,
                    card_exp_year: scenario.before.expYear,
                    card_holder_name: 'Jane Doe',
                    card_cvc: '•••',
                  },
                },
                customer_acceptance: {
                  acceptance_type: 'online',
                  online: { ip_address: '<ip_address>', user_agent: '<user_agent>' },
                },
              },
            },
            response: buildCitResponse(scenario),
          },
        ],
        currentStep: 2,
      });
    }, 900);
    timers.current.push(t);
  };

  const handleTriggerMit = () => {
    setStage('charging');
    setRefreshStepIndex(0);

    const steps = refreshStepsFor(scenario);
    steps.forEach((_, i) => {
      const t = setTimeout(() => setRefreshStepIndex(i + 1), 550 * (i + 1));
      timers.current.push(t);
    });

    const finish = setTimeout(() => {
      setStage('done');
      setApiResponse((prev) => ({
        steps: [
          ...prev.steps,
          {
            title: 'Step 3: Trigger MIT',
            request: {
              method: 'POST',
              url: '/payments',
              body: {
                amount: AMOUNT,
                currency: CURRENCY,
                confirm: true,
                profile_id: PROFILE_ID,
                customer_id: CUSTOMER_ID,
                off_session: true,
                recurring_details: { type: 'payment_method_id', data: scenario.paymentMethodId },
              },
            },
            response: buildMitResponse(scenario),
          },
        ],
        currentStep: 3,
      }));
    }, 550 * (steps.length + 1));
    timers.current.push(finish);
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
        <h3 className="font-medium text-blue-900 dark:text-blue-300 mb-2">Account Updater</h3>
        <p className="text-sm text-blue-700 dark:text-blue-400 break-words mb-2">
          Keep saved cards up to date automatically. Account Updater refreshes card details before
          recurring payments, helping prevent failures from expired or reissued cards.
        </p>
        <p className="text-sm text-blue-700 dark:text-blue-400 break-words">
          <span className="font-semibold">For merchants:</span> Fewer failed recurring payments,
          with no changes to the payment flow.
        </p>
      </div>

      <div className="px-1 py-2">
        <Stepper stage={stage} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => resetTo(s.id)}
            className={`flex-1 flex items-center gap-2 text-left px-4 py-3 rounded-lg border transition-colors ${
              scenarioId === s.id
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <NetworkMark network={s.network} size="sm" />
            <span className="text-sm font-medium">{s.label}</span>
          </button>
        ))}
      </div>

      {stage === 'idle' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            The customer checks out and saves this card for future use.
          </p>
          <div className="flex justify-center">
            <div className="w-full max-w-sm">
              <PaymentElementMock scenario={scenario} />
            </div>
          </div>
          <button
            onClick={handleSaveCard}
            className="w-full bg-primary hover:bg-primary-dark text-white font-medium py-3 px-4 sm:px-6 rounded-lg transition-colors min-h-[44px]"
          >
            Save Card ($100.00)
          </button>
        </div>
      )}

      {stage === 'saving' && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">Saving card…</span>
        </div>
      )}

      {(stage === 'saved' || stage === 'charging' || stage === 'done') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-900 dark:text-white">Card on file</h4>
            <button
              onClick={() => resetTo(scenarioId)}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary underline"
            >
              Restart demo
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <CardFace label="Before (saved)" network={scenario.network} card={scenario.before} />
            {stage === 'done' && (
              <CardFace label="After (refreshed by network)" network={scenario.network} card={scenario.after} highlight />
            )}
          </div>

          {stage === 'saved' && (
            <>
              <div className="bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">💳 The card above has since expired or been reissued by the bank, and the merchant has no idea.</p>
              </div>
              <button
                onClick={handleTriggerMit}
                className="w-full bg-primary hover:bg-primary-dark text-white font-medium py-3 px-4 sm:px-6 rounded-lg transition-colors min-h-[44px]"
              >
                Trigger MIT ($100): merchant charges the saved card
              </button>
            </>
          )}

          {stage === 'charging' && (
            <div className="bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-2">
              {refreshStepsFor(scenario).map((label, i) => (
                <div key={label} className="flex items-center gap-2 text-sm">
                  {i < refreshStepIndex ? (
                    <span className="text-green-600 dark:text-green-400">✓</span>
                  ) : i === refreshStepIndex ? (
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  ) : (
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-gray-300 dark:border-gray-600" />
                  )}
                  <span className={i <= refreshStepIndex ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-600'}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {stage === 'done' && (
            <div className="p-3 sm:p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm font-semibold text-green-900 dark:text-green-300 mb-1">
                ✅ {scenario.outcomeTitle}: payment succeeded
              </p>
              <p className="text-sm text-green-800 dark:text-green-400">{scenario.outcomeDesc}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AccountUpdater;
