import { TICKET_LAYOUT } from './ticket-fixtures';
import { workspaceTicketHtml } from './workspace-fixture';

const additionalGroups = Array.from({ length: 11 }, (_, index) => ({
  id: `sample.extra-${index}`, label: `Additional properties ${index + 1}`,
  controls: [{ id: `Custom.ExampleField${index}`, label: `Example field ${index + 1}`, controlType: 'FieldControl' }],
}));
export const BUG_LAYOUT = {
  pages: TICKET_LAYOUT.pages.map(page => page.id !== 'sample.details' ? page : {
    ...page,
    sections: [
      ...page.sections,
      { id: 'bug-main', groups: [
        { id: 'sample.repro', label: 'Repro Steps', controls: [
          { id: 'Microsoft.VSTS.TCM.ReproSteps', label: 'Repro Steps', controlType: 'HtmlFieldControl' },
        ] },
        { id: 'sample.system-info-markdown', label: 'System Info', controls: [
          { id: 'Microsoft.VSTS.TCM.SystemInfo', label: 'System Info', controlType: 'HtmlFieldControl' },
        ] },
      ] },
      { id: 'bug-side', groups: [
        { id: 'sample.system-info-fields', label: 'System Info', controls: [
          { id: 'Custom.ExampleRegression', label: 'Regression', controlType: 'FieldControl' },
          { id: 'Microsoft.VSTS.Common.HowFound', label: 'How Found', controlType: 'FieldControl' },
        ] },
        ...additionalGroups,
      ] },
    ],
  }),
};

function markdownCard(id: string, label: string, field: string) {
  return `<div class="flex-column work-item-form-group" id="${id}">
    <div class="work-item-form-collapsible-section work-item-form-section-dark-theme-override">
      <div class="work-item-form-collapsible-header margin-bottom-4 flex-row justify-space-between" role="button">
        <span class="font-size-ml font-weight-semibold" role="heading"><div>${label}</div></span>
        <div class="work-item-form-section-controls"><button class="work-item-form-toggle" aria-label="Expand ${label}">
          <span class="fabric-icon ms-Icon--FullScreen"></span>
        </button></div>
      </div>
      <div class="work-item-form-collapsible-section-content" role="region">
        <div class="work-item-form-control-wrapper" data-field-name="${field}">
          <div class="work-item-form-control-content-wrapper flex-column full-height">
            <div class="work-item-form-control-content flex-column new-css-for-md-fields show-markdown-preview limited-height">
              <div class="preview-mode-container"><div class="markdown-editor-placeholder" role="textbox" aria-label="${label} draft">
                Fictional Markdown body for ${label}.
              </div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

export function bugTicketHtml({ extraGroups = true, headerless = true, heading = true, ids = true } = {}) {
  const fields = `<div class="flex-column work-item-form-group" id="sample.system-info-fields">
    ${heading ? `<div class="${headerless ? 'sample-group-heading' : 'work-item-form-collapsible-header'}" role="heading">System Info</div>` : ''}
    <div class="work-item-form-control-wrapper" data-field-name="Custom.ExampleRegression">
      <label class="work-item-control-label">Regression</label><input aria-label="Regression" value="No">
    </div>
    <div class="work-item-form-control-wrapper" data-field-name="Microsoft.VSTS.Common.HowFound">
      <label class="work-item-control-label">How Found</label><input aria-label="How Found" value="Testing">
    </div>
  </div>`;
  const extras = additionalGroups.map(group => `<div class="work-item-form-group" id="${group.id}">
    <div class="work-item-form-collapsible-header"><span role="heading">${group.label}</span></div>
    <div class="work-item-form-control-wrapper" data-field-name="${group.controls[0]?.id}">
      <label class="work-item-control-label">${group.controls[0]?.label}</label><input value="Fictional value">
    </div></div>`).join('');
  const html = workspaceTicketHtml(false, true)
    .replaceAll('data-work-item-type="User Story"', 'data-work-item-type="Bug"')
    .replace('<span>User Story</span>', '<span>Bug</span>')
    .replace('<div class="work-item-form-first-section">', `<div class="work-item-form-first-section">
      <div class="work-item-form-section">
        ${markdownCard('sample.repro', 'Repro Steps', 'Microsoft.VSTS.TCM.ReproSteps')}
        ${markdownCard('sample.system-info-markdown', 'System Info', 'Microsoft.VSTS.TCM.SystemInfo')}
      </div>`)
    .replace('<div class="work-item-form-section" id="sample.secondary-column">',
      `<div class="work-item-form-section" id="sample.secondary-column">${fields}${extraGroups ? extras : ''}`)
    .replace('</style>', `.markdown-editor-placeholder{min-height:82px;padding:8px}
      .sample-group-heading{font-weight:600;padding:4px 0}
      .work-item-form-section{grid-template-rows:none!important;min-height:0!important}
      </style>`);
  // Real ADO cards do not expose process group IDs, so only captions and fields can identify them.
  return ids ? html : html.replace(' id="sample.system-info-markdown"', '').replace(' id="sample.system-info-fields"', '');
}
