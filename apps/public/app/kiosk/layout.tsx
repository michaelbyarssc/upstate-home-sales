import { KioskShell } from './kiosk-shell';
import './kiosk.css';

export const metadata = { title: 'Kiosk' };

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return <KioskShell>{children}</KioskShell>;
}
