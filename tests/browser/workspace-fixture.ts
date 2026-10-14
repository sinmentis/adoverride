import { nativeActionsTicketHtml } from './ticket-fixtures';

export function workspaceTicketHtml(dialog = false, dark = true) {
  let html = nativeActionsTicketHtml(dark)
    .replace(/<header class="work-item-form-header">[\s\S]*?<\/header>/, `
      <div class="flex-row sample-header-wrap">
        <div class="work-item-form-header-type-deco"></div>
        <div class="work-item-form-header flex-column">
          <div class="flex-row sample-type-row"><span>User Story</span><a href="#sample-id">101</a></div>
          <div class="flex-row sample-title-row"><div class="flex-row flex-grow"><div class="flex-column flex-grow">
            <div class="work-item-title-textfield bolt-textfield"><input aria-label="Title" value="Sample work item"></div>
          </div></div></div>
          <div class="sample-header-bottom">
            <div class="work-item-header-command-bar flex-row" role="menubar"><button type="button" data-native-save>Save</button><button type="button">Close</button></div>
            <div class="inline-flex-row"><div class="bolt-identitypickerdropdown"><div class="work-item-assignment-dropdown">
              <input aria-label="Assigned to" value="Unassigned">
            </div></div></div>
            <span class="wif-comment-count-link">0 Comments</span>
            <div class="work-item-tag-picker"><input aria-label="Tags" value="Sample"></div>
          </div>
        </div>
      </div>
      <div class="work-item-form-expanded-section-container full-height"><div class="scroll-hidden full-width"><div class="full-height flex-column">
        <div class="work-item-form-subheader-container flex-row"><div class="work-item-form-subheader flex-row">
          <div class="flex-column sample-state-fields">
            <div class="flex-row sample-header-field"><label class="work-item-control-label">State</label><input aria-label="State" value="Active"></div>
            <div class="flex-row sample-header-field"><label class="work-item-control-label">Reason</label><input aria-label="Reason" value="Implementation started" readonly></div>
          </div>
          <div class="wif-node-dropdowns flex-column">
            <div class="flex-row sample-header-field"><label class="work-item-control-label">Area</label><input aria-label="Area" value="Sample\\\\Product"></div>
            <div class="flex-row sample-header-field"><label class="work-item-control-label">Iteration</label><input aria-label="Iteration" value="Sample\\\\Sprint 12"></div>
          </div>`)
    .replace('<div class="work-item-form-subheader wif-tabbar">', '<div class="wif-tabbar-container flex-column"><div class="sample-updated">Recently updated</div><div class="wif-tabbar">')
    .replace('<div class="work-item-grid">', '</div></div></div><div class="work-item-form-page-content page-content flex-grow full-width"><div class="work-item-grid">')
    .replace(/(<div class="work-item-form-control-wrapper" data-field-name="Microsoft\.VSTS\.[^"]+">)(<label[^>]*>[^<]+<\/label>)(<input[^>]*>)(<\/div>)/g,
      '$1<div class="work-item-form-control-content-wrapper flex-column"><div class="flex-row">$2</div><div class="work-item-form-control-content">$3</div></div>$4')
    .replace('</style>', `
      .flex-row { display:flex; } .flex-column { display:flex;flex-direction:column; } .flex-grow { flex:1;min-width:0; }
      .full-width { width:100%;box-sizing:border-box; }
      .work-item-form-page { display:flex;flex-direction:column;height:776px;width:100%;padding:0;overflow:auto;box-sizing:border-box; }
      .sample-header-wrap { flex:0 0 auto; } .work-item-form-header-type-deco { width:10px; background:#0078d4; }
      .work-item-form-header { flex:1;padding:0 8px 4px;overflow:auto; } .sample-type-row { height:24px;align-items:center;gap:8px; }
      .sample-title-row { height:38px;align-items:center; } .work-item-title-textfield input { width:100%;font:18px sans-serif; }
      .sample-header-bottom { min-height:44px; } .work-item-header-command-bar { float:right;gap:8px; }
      .sample-header-bottom>.inline-flex-row { display:inline-flex;width:270px; }
      .work-item-tag-picker { display:inline-flex;flex-wrap:wrap;min-height:32px; }
      .work-item-form-expanded-section-container { flex:1;min-height:0;overflow:auto; }
      .work-item-form-expanded-section-container>.scroll-hidden { height:100%;overflow:hidden; }
      .work-item-form-expanded-section-container>.scroll-hidden>.full-height { height:100%; }
      .work-item-form-subheader-container { flex:0 0 auto; }
      .work-item-form-subheader { flex:1;flex-wrap:wrap;padding:4px 8px;overflow:auto; }
      .sample-state-fields { width:286px;padding-left:8px; } .wif-node-dropdowns { flex:1;padding:4px 0 4px 8px; }
      .sample-header-field { min-height:34px;align-items:center; } .sample-header-field>label { width:76px;flex:0 0 auto; }
      .sample-header-field>input { flex:1;min-width:0; } .wif-tabbar-container { flex:1 1 100%;align-items:flex-end; }
      .sample-updated { height:16px; } .wif-tabbar { display:flex;flex-wrap:wrap;gap:4px; }
      .work-item-form-page-content { flex:1;min-height:0;overflow:auto;padding:16px 12px; }
      .work-item-grid { width:100%; }
      .work-item-form-group { padding-bottom:20px; }
      .work-item-form-page input,.work-item-form-page button { min-height:32px;box-sizing:border-box; }
      .work-item-form-page input { color:inherit;background:var(--native-background);border:1px solid #888;padding:4px 8px; }
      .work-item-form-page button { color:inherit;background:var(--native-background);border:1px solid #888; }
      #sample\\.planning-fields>.work-item-form-control-wrapper { margin:0;padding-bottom:7px; }
      #sample\\.planning-fields .work-item-form-control-content-wrapper { margin-inline:8px; }
      </style>`);
  const end = html.lastIndexOf('</div>');
  html = html.slice(0, end) + '</div></div></div></div>' + html.slice(end);
  if (dialog) html = html.replace('<div class="work-item-form-page"', '<div class="work-item-form-dialog" style="width:700px"><div class="work-item-form-page"')
    .replace('</body>', '</div></body>');
  if (dialog) html = html.replace('<div class="work-item-form-dialog"', '<div class="kanban-board"><div class="wit-card" data-work-item-id="202">Background card</div></div><div class="work-item-form-dialog"');
  return html;
}

export function boardOpenedWorkspaceHtml(dialog = false, dark = true) {
  return workspaceTicketHtml(dialog, dark)
    .replace('<div class="flex-row sample-header-wrap">', `
      <div class="work-item-form-nav-bar flex-row flex-grow flex-center">
        <button type="button" data-native-back>Back to Board</button>
        <button type="button">Previous</button><button type="button">Next</button>
      </div>
      <div class="flex-row sample-header-wrap">`)
    .replace('</style>', `
      .work-item-form-page { height:983px; }
      .work-item-form-nav-bar { min-height:55px;align-items:center;gap:8px; }
      </style>`);
}
