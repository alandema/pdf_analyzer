'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from '@/auth';
import { saveSession } from '@/session';

// Login Page - Simple and focused on ONE task
export default function LoginPage() {
  const router = useRouter();
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Handle login button click
  async function handleLogin() {
    // Call the auth API
    const result = await signIn(email, password);
    
    // Save session to browser
    saveSession(email, result.idToken);
    
    // Go to dashboard
    router.push('/');
  }

  return (
    <main className="container">
      <h1>📄 PDF Analyzer</h1>
      
      <div className="card">
        <h2>Login</h2>
        
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        
        <button onClick={handleLogin}>Login</button>
        
        {error && <div className="error">{error}</div>}
        
        <p className="link-text">
          Don't have an account? <a href="/signup">Sign Up</a>
        </p>
      </div>
    </main>
  );
}
