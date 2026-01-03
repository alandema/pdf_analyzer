'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signUp } from '@/auth';

// Signup Page - Simple registration form
export default function SignupPage() {
  const router = useRouter();
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  // Handle signup button click
  async function handleSignup() {
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    // Call the auth API
    await signUp(email, password);
    
    // Save email for confirmation page
    localStorage.setItem('pendingEmail', email);
    
    // Go to confirmation page
    router.push('/confirm');
  }

  return (
    <main className="container">
      <h1>📄 PDF Analyzer</h1>
      
      <div className="card">
        <h2>Sign Up</h2>
        
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        
        <input
          type="password"
          placeholder="Password (min 8 chars, upper+lower+number)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <input
          type="password"
          placeholder="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        
        <button onClick={handleSignup}>Sign Up</button>
        
        {error && <div className="error">{error}</div>}
        
        <p className="link-text">
          Already have an account? <a href="/login">Login</a>
        </p>
      </div>
    </main>
  );
}
