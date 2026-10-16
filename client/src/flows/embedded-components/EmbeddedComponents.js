import React, { useEffect, useState } from 'react';
import { loadHyperswitch } from '@juspay-tech/hyperswitch-control-center-embed-core';
import { HyperswitchProvider, ConnectorConfiguration, Payments, Refunds } from '@juspay-tech/hyperswitch-control-center-embed-react';
import { ArrowLeft, ArrowRight, RotateCw, Lock, Code2, ChevronRight } from 'lucide-react';
import API_BASE_URL from '../../config';
import Header from './Header';
import Sidebar from './Sidebar';
import './embedded-components.css';

const EMBED_URL = 'https://app.hyperswitch.io';

const COMPONENTS = {
  connectors: {
    Component: ConnectorConfiguration,
    mockUrl: 'dashboard.merchant.example.com/payments/connectors',
    tabTitle: 'Payment Connectors — Dashboard',
    breadcrumb: 'Connectors',
    title: 'Payment Connectors',
    subtitle: 'Connect and manage the payment processors used to settle transactions on your account.',
  },
  payments: {
    Component: Payments,
    mockUrl: 'dashboard.merchant.example.com/payments/transactions',
    tabTitle: 'Payments — Dashboard',
    breadcrumb: 'Payments',
    title: 'Payments',
    subtitle: 'Search, filter and inspect every payment processed on your account.',
  },
  refunds: {
    Component: Refunds,
    mockUrl: 'dashboard.merchant.example.com/payments/refunds',
    tabTitle: 'Refunds — Dashboard',
    breadcrumb: 'Refunds',
    title: 'Refunds',
    subtitle: 'Track the status of refunds issued against your payments.',
  },
};

const EmbeddedComponents = ({ component = 'connectors' }) => {
  const { Component, mockUrl, tabTitle, breadcrumb, title, subtitle } = COMPONENTS[component];
  const [errorMessage, setErrorMessage] = useState(null);
  const [hyperswitchInstance, setHyperswitchInstance] = useState(null);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/embedded/hyperswitch`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          setErrorMessage(errorData.error || `API returned ${response.status}`);
          return undefined;
        }

        const responseData = await response.json();
        return responseData.data?.token || responseData.token;
      } catch (error) {
        setErrorMessage(error.message || 'Failed to fetch token');
        return undefined;
      }
    };

    const instance = loadHyperswitch({
      fetchToken,
      initConfig: { backgroundColor: '#ffffff' },
    });
    setHyperswitchInstance(instance);
  }, []);

  return (
    <div className="ec-root">
      <div className="ec-stage">
        <div className="ec-browser">
          <div className="ec-browser-chrome">
            <div className="ec-traffic-lights">
              <span className="ec-light ec-light-red" />
              <span className="ec-light ec-light-yellow" />
              <span className="ec-light ec-light-green" />
            </div>
            <div className="ec-browser-nav">
              <button type="button" className="ec-browser-nav-btn" aria-label="Back" disabled>
                <ArrowLeft size={14} />
              </button>
              <button type="button" className="ec-browser-nav-btn" aria-label="Forward" disabled>
                <ArrowRight size={14} />
              </button>
              <button type="button" className="ec-browser-nav-btn" aria-label="Reload">
                <RotateCw size={13} />
              </button>
            </div>
            <div className="ec-url-bar">
              <Lock size={11} className="ec-url-lock" />
              <span className="ec-url-text">{mockUrl}</span>
            </div>
            <div className="ec-browser-chrome-right" aria-hidden="true" />
          </div>

          <div className="ec-browser-tabbar">
            <div className="ec-browser-tab ec-browser-tab-active">
              <span className="ec-favicon" />
              <span className="ec-tab-title">{tabTitle}</span>
            </div>
          </div>

          <div className="ec-browser-viewport">
            <div className="ec-dash">
              <Header />
              <div className="ec-dash-body">
                <Sidebar active={component} />
                <main className="ec-dash-main">
                  <div className="ec-breadcrumb">
                    <span>Payments</span>
                    <ChevronRight size={12} className="ec-breadcrumb-sep" />
                    <span className="ec-breadcrumb-current">{breadcrumb}</span>
                  </div>
                  <h1 className="ec-page-title">{title}</h1>
                  <p className="ec-page-subtitle">{subtitle}</p>

                  <div className="ec-embed-wrap">
                    <div className="ec-embed-badge">
                      <Code2 size={11} strokeWidth={2.5} />
                      Hyperswitch Embed
                    </div>
                    <div className="ec-embed">
                      {errorMessage && (
                        <div className="ec-error-state">
                          <h3>Connection Error</h3>
                          <p>{errorMessage}</p>
                        </div>
                      )}
                      {hyperswitchInstance && (
                        <HyperswitchProvider hyperswitchInstance={hyperswitchInstance}>
                          <Component url={EMBED_URL} />
                        </HyperswitchProvider>
                      )}
                    </div>
                  </div>
                </main>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmbeddedComponents;
