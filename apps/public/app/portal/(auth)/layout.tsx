import { PortalBodyClass } from '../portal-body-class';
import '../portal.css';

export default function PortalAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PortalBodyClass />
      <div className="portal-auth-wrap">{children}</div>
    </>
  );
}
