// Fictional pull request pages that follow the structure captured from a real Azure DevOps PR
// (class names, nesting, geometry). All names, titles and text are invented.

const BASE_CSS = `
*{box-sizing:border-box;} body{margin:0;font:14px/20px "Segoe UI",sans-serif;background:#fff;color:#201f1e;}
body.ms-vss-web-vsts-theme-dark{background:#1b1a19;color:#f3f2f1;--communication-foreground:#4ca1e8;}
.flex-row{display:flex;flex-direction:row;} .flex-column{display:flex;flex-direction:column;} .inline-flex-row{display:inline-flex;}
.flex-grow{flex-grow:1;} .flex-noshrink{flex-shrink:0;} .flex-center{align-items:center;} .flex-start{align-items:flex-start;}
.scroll-hidden{overflow:hidden;} .h-scroll-hidden{overflow-x:hidden;} .relative{position:relative;} .absolute{position:absolute;}
.rhythm-vertical-16>*:not(:first-child){margin-top:16px;} .rhythm-vertical-24>*:not(:first-child){margin-top:24px;}
.rhythm-vertical-8>*:not(:first-child){margin-top:8px;} .rhythm-horizontal-8>*:not(:first-child){margin-left:8px;}
.padding-vertical-16{padding-top:16px;padding-bottom:16px;} .padding-horizontal-20{padding-left:20px;padding-right:20px;}
.padding-vertical-8{padding-top:8px;padding-bottom:8px;} .margin-4{margin:4px;}
.separator-line-bottom{border-bottom:1px solid rgba(0,0,0,.08);} .shadow-padding{margin:-4px;padding:4px;}
.v-scroll-auto{overflow-y:auto;} .full-size{height:100%;} .sticky{position:sticky;top:0;z-index:2;background:inherit;}
.bolt-card{background:#fff;border-radius:4px;box-shadow:0 1.6px 3.6px rgba(0,0,0,.13);}
.ms-vss-web-vsts-theme-dark .bolt-card{background:#252423;}
svg.bolt-status{width:24px;height:24px;flex-shrink:0;} svg.repos-reviewer-vote-icon{width:16px;height:16px;margin-right:12px;}
.bolt-status.failed circle{fill:#cd4a45;} .bolt-status.active circle{fill:#0078d4;} .bolt-status.success circle{fill:#2b8a3e;} .bolt-status.neutral circle{fill:#8a8886;}
.app{height:100vh;} .repos-pr-details-page{height:100vh;overflow-y:auto;}
.repos-pr-header{padding:20px 20px 0 12px;margin:0 12px 8px;} .repos-pr-title{font-size:20px;line-height:34px;min-height:34px;}
.pr-secondary-title-row{margin:4px 0 0 8px;color:#605e5c;} .bolt-pill{padding:0 8px;border-radius:11px;background:#e1dfdd;color:#201f1e;}
.repos-pr-details-page-tabbar{height:48px;padding:0 32px 0 24px;} .bolt-tabbar-tabs.tall{height:48px;} .bolt-tab{height:48px;padding:0 8px;display:flex;align-items:center;color:inherit;text-decoration:none;}
.page-content{padding:16px 32px;} .repos-overview-right-pane{width:340px;margin-left:28px;}
.repos-reviewer{padding:10px 8px 10px 12px;min-height:55px;} .repos-pr-no-items-well{padding:12px;}
.bolt-button{font:inherit;padding:6px 12px;border:1px solid #8a8886;border-radius:2px;background:transparent;color:inherit;}
table{border-collapse:collapse;width:100%;} td{padding:0;}
.bolt-timeline-row>td{padding:8px 0;} .iteration-card{min-height:72px;} .repos-discussion-thread{min-height:120px;padding:12px;}
.bolt-callout{z-index:10;background:#fff;box-shadow:0 6px 14px rgba(0,0,0,.2);} .ms-vss-web-vsts-theme-dark .bolt-callout{background:#252423;}
.bolt-list-box-row{cursor:pointer;} .bolt-list-box-row>td{padding:6px 12px;}
.repos-pr-description-card{min-height:560px;}
.repos-compare-toolbar{padding:16px 32px;height:70px;} .repos-changes-explorer-splitter{display:flex;height:calc(100vh - 210px);}
.vss-Splitter--pane-fixed{width:295px;overflow:auto;} .bolt-tree-row td{white-space:nowrap;} .bolt-tree-expand-button{display:inline-block;width:24px;padding-left:6px;}
.text-ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;} .diff{height:240px;margin:8px;border:1px solid #c8c6c4;}
`;

function header() {
  return `<div class="repos-pr-header margin-bottom-8 bolt-header flex-row flex-noshrink flex-start">
    <span role="heading" aria-level="1"><span class="screen-reader-only"></span></span>
    <div class="flex-column flex-grow">
      <div class="flex-row rhythm-horizontal-8 flex-center flex-grow">
        <div class="repos-pr-title-row inline-flex-row flex-grow rhythm-horizontal-8 flex-center">
          <div class="flex-column flex-grow"><div class="repos-pr-title title-m flex-grow editable bolt-textfield flex-row">Add a fictional cache warmer</div></div>
        </div>
        <div class="repos-pr-header-vote-button bolt-split-button inline-flex-row"><button class="bolt-split-button-main bolt-button" data-mutating="vote">Approve</button></div>
        <div class="repos-pr-header-complete-button bolt-split-button inline-flex-row"><button class="bolt-split-button-main bolt-button primary" data-mutating="complete">Set auto-complete</button></div>
      </div>
      <div class="flex-row">
        <div class="pr-secondary-title-row secondary-text flex-row margin-left-8 rhythm-horizontal-4 flex-center">
          <div class="pr-status-active bolt-pill flex-row flex-center">Active</div><span>Sample Author</span>
          <div class="pr-header-branches"><a class="bolt-link" href="#source">feature/sample</a> into <a class="bolt-link" href="#target">main</a></div>
        </div>
      </div>
    </div>
  </div>
  <div class="repos-pr-details-page-tabbar bolt-tabbar flex-row flex-center flex-noshrink sticky">
    <div class="bolt-tabbar-tabs flex-grow flex-wrap bolt-tabs flex-row tall" role="tablist">
      <a class="bolt-tab selected" role="tab" id="__bolt-tab-overview" href="?">Overview</a>
      <a class="bolt-tab" role="tab" id="__bolt-tab-files" href="?_a=files">Files</a>
      <a class="bolt-tab" role="tab" id="__bolt-tab-updates" href="?_a=updates">Updates</a>
      <a class="bolt-tab" role="tab" id="__bolt-tab-commits" href="?_a=commits">Commits</a>
    </div>
  </div>`;
}

const status = (state: string) =>
  `<svg class="bolt-status flex-noshrink ${state} margin-4" role="presentation" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12"></circle></svg>`;

function checksCard(unknown: boolean) {
  if (unknown) return `<div class="bolt-table-card bolt-card flex-column depth-8 bolt-card-white"><div class="bolt-card-content flex-row flex-grow">
    <div class="flex-column flex-grow scroll-hidden"><div class="padding-vertical-16 padding-horizontal-20">A future card layout</div></div></div></div>`;
  return `<div class="bolt-table-card bolt-card flex-column depth-8 bolt-card-white" data-fixture="status"><div class="bolt-card-content flex-row flex-grow bolt-default-horizontal-spacing">
    <div class="flex-column flex-grow scroll-hidden">
      <div class="separator-line-bottom padding-vertical-16 padding-horizontal-20 rhythm-vertical-16" data-fixture="failed">
        <div class="flex-row flex-center rhythm-horizontal-8">${status('failed')}<div class="flex-column flex-grow scroll-hidden"><span>1 of 6 required checks failed</span><span class="secondary-text body-s">Sample build</span></div></div>
        <div class="status-details-container"><table class="preview-check-list bolt-list body-m relative scroll-hidden" role="list"><tbody>
          <tr class="bolt-list-row first-row" role="listitem"><td>${status('failed')} Sample build</td></tr>
          <tr class="bolt-list-row" role="listitem"><td>${status('active')} Sample scan</td></tr>
        </tbody></table><div class="status-details-container-row flex-row"><a class="bolt-link" href="#checks">View 6 checks</a></div></div>
      </div>
      <div class="padding-vertical-16 padding-horizontal-20 separator-line-bottom flex-row flex-center rhythm-horizontal-8" data-fixture="reviewers-policy">${status('active')}<div class="flex-column flex-grow scroll-hidden"><span>At least 1 reviewer must approve</span></div></div>
      <div class="separator-line-bottom padding-vertical-16 padding-horizontal-20 rhythm-vertical-16 proof-of-presence-container"><div class="flex-row flex-center rhythm-horizontal-8">${status('active')}<div class="flex-column flex-grow scroll-hidden"><span>Proof of presence is required</span></div>
        <div class="flex-noshrink bolt-expandable-button inline-flex-row"><button class="bolt-button primary" data-mutating="presence">Verify presence</button></div></div></div>
      <div class="padding-vertical-16 padding-horizontal-20 separator-line-bottom flex-row flex-center rhythm-horizontal-8" data-fixture="passed-a">${status('success')}<div class="flex-column flex-grow scroll-hidden"><span>Work items are linked</span></div></div>
      <div class="padding-vertical-16 padding-horizontal-20 flex-row flex-center rhythm-horizontal-8" data-fixture="passed-b">${status('success')}<div class="flex-column flex-grow scroll-hidden"><span>No merge conflicts</span><span class="flex-grow secondary-text body-s">Last checked just now</span></div></div>
    </div></div></div>`;
}

function reviewer(name: string, vote: 'neutral' | 'success', label: string) {
  return `<div class="repos-reviewer flex-row flex-center" data-fixture-reviewer="${name}">
    <svg class="bolt-status flex-noshrink ${vote} repos-reviewer-vote-icon icon-large-margin" role="img" viewBox="0 0 24 24"><desc>${label}</desc><circle cx="12" cy="12" r="12"></circle></svg>
    <div><span class="avatar">${name.slice(0, 2)}</span></div>
    <div class="flex-column flex-grow text-ellipsis icon-large-margin"><span>${name}</span><span class="secondary-text body-s">${label}</span></div>
    <div class="repos-reviewer-reveal bolt-expandable-button inline-flex-row"><button class="bolt-button" aria-label="Reviewer actions">...</button></div>
  </div>`;
}

function rail() {
  const silent = ['Sample Reviewer A', 'Sample Reviewer B', 'Sample Reviewer C', 'Sample Reviewer D', 'Sample Reviewer E'];
  return `<div class="repos-overview-right-pane flex-column flex-noshrink rhythm-vertical-24">
    <div class="flex-column" data-fixture="reviewers">
      <div class="no-padding bolt-header-with-commandbar bolt-header flex-row flex-noshrink flex-start"><div class="bolt-header-content-area flex-row flex-grow"><div class="bolt-header-title-area flex-column flex-grow"><h3>Reviewers</h3></div>
        <div class="bolt-header-commandbar bolt-button-group flex-row" role="toolbar"><button class="bolt-button">Add</button></div></div></div>
      <div class="flex-grow flex-column pr-required-reviewers-section"><div class="margin-bottom-8 body-s secondary-text font-weight-semibold">Required</div>
        <div class="repos-pr-no-items-well cursor-pointer" role="button" tabindex="0">Add required reviewers</div></div>
      <div class="flex-grow flex-column pr-optional-reviewers-section"><div class="margin-bottom-8 body-s secondary-text font-weight-semibold">Optional</div>
        ${reviewer('Sample Approver', 'success', 'Approved')}${silent.map(name => reviewer(name, 'neutral', 'No review yet')).join('')}</div>
    </div>
    <div class="flex-column rhythm-vertical-8" data-fixture="tags">
      <div class="no-padding bolt-header-with-commandbar bolt-header flex-row"><div class="bolt-header-content-area flex-row flex-grow"><h3>Tags</h3></div></div>
      <div class="repos-pr-no-items-well cursor-pointer" role="button" tabindex="0">No tags</div>
    </div>
    <div class="rhythm-vertical-16 region-pullRequestDetailsOverviewExtensions" data-fixture="workitems">
      <div class="flex-column rhythm-vertical-8"><div class="no-padding flex-grow bolt-header-with-commandbar bolt-header flex-row"><h3>Work items</h3></div>
        <div class="bolt-table-container flex-grow"><table class="linked-wit-pr-details bolt-table" role="grid"><tbody><tr><td>Sample work item</td></tr></tbody></table></div></div>
    </div>
  </div>`;
}

const ROWS: { kind: 'push' | 'active' | 'resolved' }[] = [
  { kind: 'push' }, { kind: 'active' }, { kind: 'push' }, { kind: 'resolved' }, { kind: 'active' }, { kind: 'push' }, { kind: 'push' },
];
function activity() {
  return `<table class="activity-feed-list"><tbody>${ROWS.map(({ kind }, index) => `<tr class="bolt-timeline-row" data-fixture-kind="${kind}"><td>${kind === 'push' ?
    `<div class="bolt-table-card bolt-card iteration-card"><a class="activity-feed-timeline-iteration" href="?_a=files&iteration=${index}">${index}</a> Sample Author pushed 1 commit</div>` :
    `<div class="repos-discussion-thread"><div class="repos-comment-viewer repos-discussion-comment">A fictional review comment ${index}</div>
      <button class="bolt-button" data-mutating="resolve">${kind === 'active' ? 'Resolve' : 'Reactivate'}</button></div>`}</td></tr>`).join('')}</tbody></table>`;
}

const DROPDOWN_SCRIPT = (initial: string) => `
(() => {
  const OPTIONS = [['everything', 'Show everything'], ['all_comments', 'All comments'], ['new', "What's new"], ['my_comments', 'My comments/replies'], ['active_comments', 'Active comments'], ['resolved_comments', 'Resolved comments']];
  const rows = () => [...document.querySelectorAll('tr.bolt-timeline-row')];
  const match = (id, row) => { const kind = row.dataset.fixtureKind;
    return id === 'everything' || id === 'all_comments' && kind !== 'push' || id === 'active_comments' && kind === 'active' || id === 'resolved_comments' && kind === 'resolved'; };
  const count = id => id === 'new' ? 0 : id === 'my_comments' ? 1 : rows().filter(row => match(id, row)).length;
  let selected = '${initial}';
  const button = document.querySelector('.repos-activity-filter-dropdown > button');
  const render = () => {
    button.querySelector('.bolt-button-text').textContent = OPTIONS.find(o => o[0] === selected)[1] + ' (' + count(selected) + ')';
    for (const row of rows()) row.hidden = !match(selected, row);
  };
  let callout = null;
  const close = () => { callout?.remove(); callout = null; button.setAttribute('aria-expanded', 'false'); };
  button.addEventListener('click', () => {
    window.__fixtureFilterOpens = (window.__fixtureFilterOpens || 0) + 1;
    if (callout) return close();
    callout = document.createElement('div');
    callout.className = 'flex-row flex-grow';
    callout.innerHTML = '<div class="bolt-callout absolute flex-row" style="left:40px;top:300px;width:260px"><div class="bolt-dropdown flex-column custom-scrollbar"><div class="bolt-dropdown-container no-outline"><div class="bolt-dropdown-list-box-container bolt-table-container flex-grow"><table role="listbox" aria-label="Dropdown Selection" class="bolt-list-box bolt-table bolt-list body-m relative scroll-hidden"><tbody>' +
      OPTIONS.map(o => '<tr role="option" class="bolt-list-box-row cursor-pointer bolt-table-row bolt-list-row" id="__bolt-' + o[0] + '" aria-selected="' + (o[0] === selected) + '"><td>' + o[1] + ' (' + count(o[0]) + ')</td></tr>').join('') +
      '</tbody></table></div></div></div></div>';
    document.body.append(callout);
    button.setAttribute('aria-expanded', 'true');
    callout.addEventListener('click', event => {
      const option = event.target.closest('[role="option"]');
      if (!option) return;
      selected = option.id.replace('__bolt-', '');
      window.__fixtureFilterChoice = selected;
      close(); render(); setTimeout(() => button.focus(), 30);
    });
  });
  render();
  for (const element of document.querySelectorAll('[data-mutating]')) element.addEventListener('click', () => { window.__fixtureMutations = (window.__fixtureMutations || 0) + 1; });
})();`;

export function prOverviewHtml({ dark = false, filter = 'everything', unknownStatus = false } = {}) {
  return `<!doctype html><html><head><title>Pull request 42: Add a fictional cache warmer</title><style>${BASE_CSS}</style></head>
  <body class="${dark ? 'ms-vss-web-vsts-theme-dark' : 'ms-vss-web-vsts-theme'}"><div class="app full-size region-page"><div class="flex-column full-size vertical-layout">
    <div class="repos-pr-details-page flex-grow custom-scrollbar v-scroll-auto flex-column">
      ${header()}
      <div class="page-content flex-column flex-noshrink flex-grow rhythm-vertical-16 page-content-top"><div class="flex-row">
        <div class="flex-column flex-grow rhythm-vertical-16 h-scroll-hidden shadow-padding">
          ${checksCard(unknownStatus)}
          <div class="repos-pr-description-card bolt-card"><div class="padding-vertical-16 padding-horizontal-20"><h3>Description</h3><p>A fictional change description that explains the cache warmer.</p></div></div>
          <h2 class="screen-reader-only">Activity feed</h2>
          <div class="repos-activity-filter-dropdown"><button type="button" class="bolt-button bolt-expandable-button" aria-haspopup="listbox" aria-expanded="false"><span class="bolt-button-text"></span></button></div>
          ${activity()}
        </div>
        ${rail()}
      </div></div>
    </div>
  </div></div><script>${DROPDOWN_SCRIPT(filter)}</script></body></html>`;
}

const TREE: { level: number; name: string; comment?: boolean; folder?: boolean }[] = [
  { level: 1, name: '/', folder: true }, { level: 2, name: 'service', folder: true }, { level: 3, name: 'cache', folder: true },
  { level: 4, name: 'internal', folder: true }, { level: 5, name: 'warmer_scheduler_configuration.go' },
  { level: 6, name: 'A fictional inline review comment', comment: true }, { level: 5, name: 'warmer_scheduler_configuration_test.go' },
  { level: 6, name: 'Another fictional review comment', comment: true }, { level: 3, name: 'README.md' },
];
export function prFilesHtml({ dark = false } = {}) {
  const rows = TREE.map(({ level, name, comment, folder }) => `<tr class="bolt-tree-row bolt-table-row bolt-list-row single-click-activation" role="row" aria-level="${level}"${folder ? ' aria-expanded="true"' : ''} data-fixture-tree="${comment ? 'comment' : 'file'}">
    <td class="bolt-table-cell-compact bolt-table-cell bolt-list-cell"></td>
    <td class="bolt-table-cell bolt-list-cell"><div class="bolt-table-cell-content flex-row flex-center"></div></td>
    <td class="bolt-tree-cell bolt-table-cell bolt-list-cell"><div class="${comment ? 'repos-file-explorer-tree-thread-item rhythm-horizontal-4 ' : 'scroll-hidden flex-grow padding-0 '}bolt-table-cell-content flex-row flex-center">
      <span class="fluent-icons-enabled"><span class="bolt-tree-expand-button font-size cursor-pointer flex-noshrink fabric-icon small" style="margin-left: ${(level - 1) * 16}px;">${folder ? '&#9662;' : ''}</span></span>
      ${comment ? `<div class="flex-grow text-ellipsis">${name}</div>` : `<div class="padding-vertical-8 scroll-hidden flex-grow flex-row flex-center"><span class="text-ellipsis"><span>${name}</span></span></div>`}
    </div></td><td class="bolt-table-cell-compact bolt-table-cell bolt-list-cell"></td></tr>`).join('');
  return `<!doctype html><html><head><title>Pull request 42: Files</title><style>${BASE_CSS}</style></head>
  <body class="${dark ? 'ms-vss-web-vsts-theme-dark' : 'ms-vss-web-vsts-theme'}"><div class="app full-size region-page">
    <div class="repos-pr-details-page flex-grow custom-scrollbar scroll-auto-hide bolt-page v-scroll-auto flex-column bolt-page-grey">
      ${header()}
      <div class="page-content flex-column flex-noshrink flex-grow rhythm-vertical-16 padding-horizontal-0 padding-bottom-0"><div class="flex-column flex-grow">
        <div class="repos-compare-toolbar flex-row flex-center"><button class="bolt-button">All changes</button><span>6 changed files</span></div>
        <div class="scroll-hidden bolt-page-grey repos-changes-explorer-splitter vss-Splitter--container vss-Splitter--container-row">
          <div class="vss-Splitter--pane-fixed flex-column relative"><div class="absolute-fill flex-grow flex-column v-scroll-auto"><div class="bolt-table-container flex-grow">
            <table class="repos-changes-explorer-tree repos-file-explorer-tree body-xl bolt-table bolt-list body-m relative scroll-hidden" role="treegrid"><tbody>${rows}</tbody></table>
          </div></div></div>
          <div class="flex-grow v-scroll-auto">${TREE.filter(row => !row.folder && !row.comment).map(row => `<div class="diff">${row.name}</div>`).join('')}</div>
        </div>
      </div></div>
    </div>
  </div></body></html>`;
}
