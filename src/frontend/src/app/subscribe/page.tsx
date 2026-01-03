'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loadSession } from '@/session';
import { createCheckoutSession, getPlans, Plan } from '@/api';
import { config } from '@/config';

export default function SubscribePage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [error, setError] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);

  // Check if user is logged in
  useEffect(() => {
    const session = loadSession();
    if (!session.token) {
      router.push('/login');
      return;
    }
    setToken(session.token);
  }, [router]);

  // Fetch plans from Stripe
  useEffect(() => {
    async function fetchPlans() {
      try {
        setLoadingPlans(true);
        setError('');
        const { plans: stripePlans } = await getPlans();
        setPlans(stripePlans);
      } catch (err) {
        console.error('Failed to fetch plans:', err);
        setPlans([]);
        setError('Failed to load plans. Please try again.');
      } finally {
        setLoadingPlans(false);
      }
    }
    fetchPlans();
  }, []);

  // Handle subscription purchase
  async function handleSubscribe(priceId: string | null | undefined, planName: string) {
    if (!priceId) return; // Free plan - no action needed

    setLoading(planName);
    setError('');

    try {
      const currentUrl = window.location.origin;
      const { url } = await createCheckoutSession(
        token,
        priceId,
        `${currentUrl}?success=true`,
        `${currentUrl}/subscribe?canceled=true`
      );
      
      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (err) {
      setError('Failed to start checkout. Please try again.');
      setLoading(null);
    }
  }

  if (!token) return null;

  return (
    <main className="container">
      <h1>📄 Choose Your Plan</h1>
      
      <p style={{ textAlign: 'center', marginBottom: '2rem' }}>
        Upgrade your account to upload more PDFs each month.
      </p>

      {loadingPlans && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="spinner" aria-label="Loading plans" />
          <div style={{ marginTop: '0.75rem', color: '#666' }}>Loading plans…</div>
        </div>
      )}

      {!loadingPlans && error && <div className="error">{error}</div>}

      {!loadingPlans && !error && (
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {plans.map((plan) => {
            return (
              <div
                key={plan.name}
                className="card"
                style={{
                  width: '280px',
                  textAlign: 'center',
                  border: plan.name === 'Gold' ? '2px solid gold' : '1px solid #ddd',
                }}
              >
                <h2>{plan.name}</h2>
                <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '1rem 0' }}>{plan.price}</p>

                <ul style={{ textAlign: 'left', margin: '1.5rem 0', paddingLeft: '1.5rem' }}>
                  {plan.features.map((feature) => (
                    <li key={feature} style={{ marginBottom: '0.5rem' }}>
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan.priceId, plan.name)}
                  disabled={loading !== null || !plan.priceId}
                  style={{ width: '100%' }}
                >
                  {loading === plan.name ? 'Loading...' : `Subscribe to ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <button className="logout" onClick={() => router.push('/')}>
          ← Back to Dashboard
        </button>
      </div>
    </main>
  );
}
