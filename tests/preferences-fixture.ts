import { defaultBoardProfile, defaultPreferences, defaultTicketProfile, defaultView, type Preferences } from '../lib/preferences';

export function nativePreferences(): Preferences {
  const preferences = defaultPreferences();
  return { ...preferences, views: { all: { ...defaultView(), board: defaultBoardProfile() } },
    ticket: { ...preferences.ticket, ...defaultTicketProfile() } };
}
