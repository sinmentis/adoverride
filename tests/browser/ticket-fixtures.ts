import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScreenFullIcon, FoldIcon, EyeIcon, PencilIcon } from '@primer/octicons-react';

export const TICKET_LAYOUT = {
  pages: [
    { id: 'sample.details', label: 'Details', pageType: 'custom', sections: [
      { id: 'main', groups: [{ id: 'sample.description', label: 'Description', controls: [
        { id: 'System.Description', label: 'Description', controlType: 'HtmlFieldControl' },
      ] }] },
      { id: 'side', groups: [{ id: 'sample.planning', label: 'Planning', controls: [
        { id: 'Microsoft.VSTS.Common.Priority', label: 'Priority', controlType: 'FieldControl' },
        { id: 'Microsoft.VSTS.Scheduling.StoryPoints', label: 'Story Points', controlType: 'FieldControl' },
      ] }] },
    ] },
    { id: 'sample.history', label: 'History', pageType: 'history', sections: [] },
    { id: 'sample.links', label: 'Links', pageType: 'links', sections: [] },
    { id: 'sample.attachments', label: 'Attachments', pageType: 'attachments', sections: [] },
    { id: 'sample.scans', label: 'Scans', pageType: 'custom', sections: [] },
    { id: 'sample.team', label: 'Team', pageType: 'custom', sections: [
      { id: 'team', groups: [{ id: 'sample.team-notes', label: 'Team notes', controls: [
        { id: 'Custom.TeamNote', label: 'Team Note', controlType: 'FieldControl' },
      ] }] },
    ] },
    { id: 'sample.exceptions', label: 'Exception Handling', pageType: 'custom', sections: [] },
  ],
};

export function ticketHtml(dialog = false, reflow = false) {
  return `<!doctype html><html><head><title>Form customization fixture</title>
  <style>
    body { margin: 0; font: 14px sans-serif; } .work-item-form-page { padding: 16px; }
    .work-item-grid { display: grid; grid-template-columns: 65% 35%; }
    .work-item-form-first-section { grid-column: 1; grid-row: 1; }
    .work-item-form-discussion { grid-column: 1; grid-row: 2; }
    .work-item-form-right { grid-column: 2; grid-row: 1 / span 2; }
    .work-item-form-group { border: 1px solid #ccc; padding: 8px; margin-bottom: 8px; }
    .work-item-form-control-wrapper { margin: 8px 0; }
    textarea { width: 100%; box-sizing: border-box; height: 100px; }
    .work-item-form-dialog { width: 700px; max-width: 100%; }
    ${reflow ? `
    .work-item-form-right { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
    .work-item-form-right > .work-item-form-section { display: grid; grid-template-rows: 320px auto; min-height: 320px; align-content: start; }
    .work-item-form-right > .work-item-form-section:first-child { grid-column: 1; }
    .work-item-form-right > .work-item-form-section:last-child { grid-column: 2; }
    #sample\\.planning, #sample\\.development { grid-row: 1; }
    #sample\\.review { grid-row: 2; }
    #sample\\.planning-fields { display: grid; grid-template-rows: 90px auto; }
    #sample\\.planning-fields > :first-child { grid-row: 1; }
    #sample\\.planning-fields > :last-child { grid-row: 2; }
    ` : ''}
  </style></head><body>
  ${dialog ? '<div class="kanban-board"><div class="wit-card" data-work-item-id="202">Background card</div></div><div class="work-item-form-dialog" data-work-item-type="User Story">' : ''}
  <div class="work-item-form-page" data-work-item-type="User Story">
    <header class="work-item-form-header"><input aria-label="Title" value="Private draft title"><button>Active</button><button>Save</button><button>Close</button></header>
    <div class="work-item-form-subheader wif-tabbar">
      <button role="tab" id="sample.details" aria-selected="true">Details</button>
      <button role="tab" id="sample.history" aria-selected="false">History</button>
      <button role="tab" id="sample.links" aria-selected="false">Links</button>
      <button role="tab" id="sample.attachments" aria-selected="false">Attachments</button>
      <button role="tab" id="sample.scans" aria-selected="false">Scans</button>
      <button role="tab" id="sample.team" aria-selected="false">Team</button>
      <button role="tab" id="sample.exceptions" aria-selected="false">Exception Handling</button>
    </div>
    <div class="work-item-grid">
      <div class="work-item-form-first-section">
        <div class="work-item-form-group" id="sample.description"><h2 class="work-item-form-collapsible-header">Description</h2>
          <div class="work-item-form-control-wrapper" data-field-name="System.Description">
            <label class="work-item-control-label">Description</label><textarea aria-label="Description draft">Private unsaved description</textarea>
          </div>
        </div>
      </div>
      <div class="work-item-form-discussion"><h2 class="work-item-form-collapsible-header">Discussion</h2><div>Discussion region</div></div>
      <div class="work-item-form-right"><div class="work-item-form-section" id="sample.primary-column">
        <div class="work-item-form-group" id="sample.planning"><h2 class="work-item-form-collapsible-header">Planning</h2>
          <div class="work-item-form-collapsible-section-content" id="sample.planning-fields">
          <div class="work-item-form-control-wrapper" data-field-name="Microsoft.VSTS.Common.Priority"><label class="work-item-control-label">Priority</label><input aria-label="Priority value" value="2"></div>
          <div class="work-item-form-control-wrapper" data-field-name="Microsoft.VSTS.Scheduling.StoryPoints"><label class="work-item-control-label">Story Points</label><input value="5"></div>
          </div>
        </div>
        ${reflow ? `<div class="work-item-form-group" id="sample.review"><h2 class="work-item-form-collapsible-header">Review</h2>
          <div class="work-item-form-control-wrapper" data-field-name="Custom.ReviewNotes"><label class="work-item-control-label">Review Notes</label><textarea aria-label="Review draft">Unsaved review</textarea></div>
        </div>` : ''}
      </div>${reflow ? `<div class="work-item-form-section" id="sample.secondary-column">
        <div class="work-item-form-group" id="sample.development"><h2 class="work-item-form-collapsible-header">Development</h2>
          <div class="work-item-form-control-wrapper" data-field-name="Custom.DevelopmentNotes"><label class="work-item-control-label">Development Notes</label><textarea aria-label="Development draft">Unsaved development</textarea></div>
        </div>
      </div>` : ''}</div>
    </div>
  </div>${dialog ? '</div>' : ''}
  </body></html>`;
}

export function nativeTicketHtml(dark = false) {
  return ticketHtml(false, true)
    .replace('<body>', `<body class="native-${dark ? 'dark' : 'light'}">`)
    .replace('<style>', `<style>
      .native-light { --native-background: #ffffff; --native-foreground: #242424; }
      .native-dark { --native-background: #242424; --native-foreground: #f0f0f0; }
      body { background: var(--native-background); color: var(--native-foreground); }
      .work-item-form-first-section, .work-item-form-group { display: flex; flex-direction: column; }
      .work-item-form-collapsible-header { display: flex; align-items: center; min-height: 28px;
        background: var(--native-background); color: var(--native-foreground); }
      .work-item-form-collapsible-header > span { display: block; flex: 1; }
      #sample\\.description { min-height: 350px; }
      #sample\\.description .work-item-form-control-wrapper { display: flex; flex-direction: column; flex: 1; min-height: 0; }
      .html-editor { display: flex; flex: 1; min-height: 0; position: relative; }
      .rooster-editor { position: absolute; inset: 0; overflow: auto; padding: 8px; box-sizing: border-box; }
    `)
    .replace(/<h2 class="work-item-form-collapsible-header">([^<]+)<\/h2>/g,
      '<div class="work-item-form-collapsible-header flex-row"><span role="heading">$1</span></div>')
    .replace('<textarea aria-label="Description draft">Private unsaved description</textarea>',
      '<div class="html-editor"><div class="rooster-editor" contenteditable="true" role="textbox" aria-label="Description draft">Private unsaved description</div></div>');
}

export function nativeActionsTicketHtml(dark = false) {
  const actions = [
    ['Expand', ScreenFullIcon], ['Collapse', FoldIcon], ['View', EyeIcon], ['Edit', PencilIcon],
  ] as const;
  return nativeTicketHtml(dark)
    .replace('</style>', `
      .work-item-form-collapsible-header { justify-content: space-between; }
      .work-item-form-collapsible-header > span { flex: 0 1 auto; min-width: auto; }
      .work-item-form-section-controls { display: block; flex: 0 1 auto; }
      .work-item-form-section-controls > button { display: inline-flex; width: 32px; height: 32px;
        align-items: center; justify-content: center; flex: 0 0 auto; border: 0; padding: 8px; }
      </style>`)
    .replace(/(<span role="heading">([^<]+)<\/span>)(<\/div>)/g, (_, label: string, name: string, close: string) =>
      `${label}<div class="work-item-form-section-controls">${actions.map(([action, icon]) =>
        `<button class="work-item-form-toggle bolt-button bolt-icon-button" aria-label="${action} ${name}">${renderToStaticMarkup(createElement(icon, { size: 16 }))}</button>`).join('')}</div>${close}`);
}
