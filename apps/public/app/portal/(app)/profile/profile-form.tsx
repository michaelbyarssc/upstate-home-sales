'use client';

import { useState } from 'react';
import { createClient } from '@uhs/db/browser';
import type { Buyer } from '@uhs/db';

type Props = { buyer: Buyer | null; userEmail: string; recoveryMode: boolean };

export function ProfileForm({ buyer, userEmail, recoveryMode }: Props) {
  const [name, setName] = useState(buyer?.full_name ?? '');
  const [phone, setPhone] = useState(buyer?.phone ?? '');
  const [notifyEmail, setNotifyEmail] = useState(buyer?.notify_email ?? true);
  const [notifySms, setNotifySms] = useState(buyer?.notify_sms ?? false);

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [newPw, setNewPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    setSavingProfile(true);
    const sb = createClient();
    const { error } = await sb
      .from('buyers')
      .update({
        full_name: name.trim() || 'Buyer',
        phone: phone.trim() || null,
        notify_email: notifyEmail,
        notify_sms: notifySms,
      })
      .eq('id', buyer!.id);
    setSavingProfile(false);
    if (error) {
      setProfileMsg({ kind: 'err', text: error.message });
    } else {
      setProfileMsg({ kind: 'ok', text: 'Profile saved.' });
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPw.length < 8) {
      setPwMsg({ kind: 'err', text: 'Password must be at least 8 characters.' });
      return;
    }
    setSavingPw(true);
    const sb = createClient();
    const { error } = await sb.auth.updateUser({ password: newPw });
    setSavingPw(false);
    if (error) {
      setPwMsg({ kind: 'err', text: error.message });
    } else {
      setNewPw('');
      setPwMsg({ kind: 'ok', text: 'Password updated.' });
    }
  }

  return (
    <div style={{ display: 'grid', gap: 24, maxWidth: 640 }}>
      {recoveryMode && (
        <div className="portal-card" style={{ background: '#fef7e6', borderColor: '#f0d68b' }}>
          <strong>Set a new password</strong>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#8a6011' }}>
            You arrived from a password-reset link. Set a new password below to finish.
          </p>
        </div>
      )}

      {/* Contact + notifications */}
      <form onSubmit={saveProfile} className="portal-card">
        <h2 style={{ font: '600 18px/1 var(--f-body)', marginBottom: 12 }}>Contact</h2>
        <div className="portal-form" style={{ gap: 14 }}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={userEmail} disabled style={{ background: 'var(--c-bg)', color: 'var(--c-ink-mute)' }} />
            <span style={{ fontSize: 11, color: 'var(--c-ink-mute)', marginTop: 2 }}>
              Contact support to change your email.
            </span>
          </div>
          <div className="field">
            <label>Full name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(803) 555-1234" />
          </div>

          <div style={{ borderTop: '1px solid var(--c-line)', paddingTop: 14, marginTop: 4 }}>
            <h3 style={{ font: '600 14px/1 var(--f-body)', marginBottom: 10 }}>Notifications</h3>
            <label className="checkbox">
              <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} />
              Email me when there&rsquo;s a new milestone or document update.
            </label>
            <label className="checkbox" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={notifySms} onChange={(e) => setNotifySms(e.target.checked)} />
              Text me too. Reply STOP to opt out at any time.
            </label>
          </div>

          {profileMsg && <div className={profileMsg.kind === 'ok' ? 'ok' : 'err'}>{profileMsg.text}</div>}

          <button type="submit" disabled={savingProfile} style={{ alignSelf: 'flex-start' }}>
            {savingProfile ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>

      {/* Password */}
      <form onSubmit={savePassword} className="portal-card">
        <h2 style={{ font: '600 18px/1 var(--f-body)', marginBottom: 12 }}>Change password</h2>
        <div className="portal-form" style={{ gap: 14 }}>
          <div className="field">
            <label>New password</label>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          {pwMsg && <div className={pwMsg.kind === 'ok' ? 'ok' : 'err'}>{pwMsg.text}</div>}
          <button type="submit" disabled={savingPw || newPw.length < 8} style={{ alignSelf: 'flex-start' }}>
            {savingPw ? 'Saving…' : 'Update password'}
          </button>
        </div>
      </form>
    </div>
  );
}
