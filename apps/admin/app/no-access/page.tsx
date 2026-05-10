import './no-access.css';

export default function NoAccessPage() {
  return (
    <div className="noaccess-wrap">
      <div className="noaccess-card">
        <h2>You&apos;re signed in, but you&apos;re not yet a member of any dealership.</h2>
        <p>Ask your dealer&apos;s owner to invite you, or contact UHS support.</p>
        <a className="btn btn-pri" href="mailto:hello@upstatehomecenter.com">
          Contact support
        </a>
      </div>
    </div>
  );
}
