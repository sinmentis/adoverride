import { IconButton } from '@primer/react';
import { InfoIcon } from '@primer/octicons-react';

export function Help({ label, text }: { label: string; text: string }) {
  return <IconButton icon={InfoIcon} size="small" variant="invisible" className="context-help"
    aria-label={`Help: ${label}`} description={text} tooltipDirection="s" />;
}
