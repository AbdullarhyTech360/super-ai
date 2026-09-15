import AppLogo from './AppLogo';

const AiBanner = () => (
  <div className="animated-gradient-banner relative inline-flex items-center gap-1.5 rounded-full border border-primary/10 px-3 py-1 w-fit mb-2 overflow-hidden">
    <span className="banner-shine" aria-hidden="true" />
    <AppLogo size={14} className="flex-shrink-0" />
    <span className="text-xs font-semibold text-primary">Super AI</span>
  </div>
);

export default AiBanner;