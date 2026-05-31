import { SignBodyClass } from './sign-body-class';

export const metadata = { title: 'Sign document' };

export default function SignLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignBodyClass />
      {children}
    </>
  );
}
