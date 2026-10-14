import { capturedBoardHtml } from './board-fixture';

export function nativeBoardCardContent(id = 101) {
  return `<div class="card-color flex-noshrink"></div><div class="flex-column flex-grow">
    <span class="card-title flex-row"><div><span role="img" aria-label="User Story">S</span>
      <span class="font-weight-semibold selectable-text">${id}</span>
      <a class="bolt-link" href="#fixture-ticket"><span>A fictional complete title that wraps naturally without any new truncation</span></a>
    </div></span>
    <div class="card-metadata flex-column"><div class="card-pair flex-column">
      <div class="work-item-state-container flex-row flex-grow text-ellipsis"><div class="native-state-button" role="button" tabindex="0" aria-label="Change card state">
        <div class="work-item-state"><div class="work-item-state-circle"></div><div class="work-item-state-name"><span>Active</span></div></div>
      </div></div>
      <div class="owner-row flex-row"><div class="native-owner-button padding-right-4" role="button" tabindex="0" aria-label="Change card owner">
        <div class="identity-view text-ellipsis"><div class="identity-avatar vss-Persona flex-noshrink" role="img"></div><div class="identity-display-name"><span>Sample Owner</span></div></div>
      </div></div>
    </div>
    <div class="field-row flex-row flex-wrap"><div class="field-container flex-row flex-grow flex-center text-ellipsis">
      <div class="field-label text-ellipsis">Story Points</div><div class="native-field-value" role="button" tabindex="0"><div class="text-ellipsis">5</div></div>
    </div></div>
    <div class="margin-top-8"><div class="flex-row flex-wrap">
      <div class="bolt-pill flex-row flex-center margin-bottom-8 margin-right-8"><div class="bolt-pill-content text-ellipsis" role="presentation"><div class="text-ellipsis">Sample tag</div></div></div>
      <div class="bolt-pill flex-row flex-center margin-bottom-8"><div class="bolt-pill-content text-ellipsis" role="presentation"><div class="text-ellipsis">Another tag</div></div></div>
    </div></div></div>
    <div class="card-indicators flex-row flex-wrap margin-top-8">
      <button class="bolt-button bolt-icon-button" aria-label="Child item progress"><span>1/2</span></button>
      <button class="bolt-button bolt-icon-button" aria-label="Linked work"><span>3</span></button>
    </div>
  </div>`;
}

export function presentationBoardHtml(dark = true) {
  const header = `<div class="bolt-header-with-commandbar bolt-header flex-row flex-noshrink flex-start">
    <div class="bolt-header-content-area flex-row flex-grow"><div class="bolt-header-title-area flex-column flex-grow">
      <div class="bolt-header-title-row flex-row"><div class="bolt-header-title"><div class="flex-row">
        <div class="bolt-dropdown-expandable bolt-expandable-button"><button type="button" class="bolt-button" aria-label="Choose Board">Sample Board</button></div>
      </div></div></div>
    </div><div class="bolt-header-commandbar flex-row"><a class="bolt-header-command-item-button bolt-button" role="menuitem" href="#backlog"><span class="bolt-button-text">View as backlog</span></a></div></div>
  </div>
  <div class="bolt-header-with-commandbar bolt-header flex-row flex-noshrink flex-start">
    <div class="bolt-header-content-area flex-row flex-grow"><div class="bolt-header-title-area flex-column flex-grow">
      <div class="bolt-header-title-row"></div><div class="bolt-tabbar flex-row"><div class="bolt-tabbar-tabs flex-row" role="tablist">
        ${['Board', 'Analytics', 'Feature Timeline', 'Epic Roadmap'].map((label, index) =>
          `<div class="bolt-tab" role="tab" tabindex="${index === 0 ? '0' : '-1'}" aria-selected="${index === 0}">
            <span class="bolt-tab-inner-container"><span class="bolt-tab-text">${label}</span></span></div>`).join('')}
      </div></div>
    </div><div class="bolt-header-commandbar"><button class="bolt-button" aria-label="Choose work item type">Stories</button><button class="bolt-button" aria-label="Board settings">Settings</button></div></div>
  </div>
  <div class="padding-16 margin-horizontal-16"><div class="vss-FilterBar" role="toolbar">
    <input class="bolt-textfield-input" aria-label="Board filter" placeholder="Filter by keyword"><button class="bolt-button">Assigned to</button>
  </div></div>`;
  return capturedBoardHtml(dark)
    .replace(/(<article class="wit-card boards-card"[^>]*>)[\s\S]*?<\/article>/g, (markup: string, opening: string) => {
      const id = /data-work-item-id="(\d+)"/.exec(markup)?.[1];
      if (!id) throw new Error('Missing fictional native card ID.');
      return `${opening}${nativeBoardCardContent(Number(id))}</article>`;
    })
    .replace('<div class="board-toolbar"><input aria-label="Board filter" placeholder="Filter by keyword"><button>Board settings</button></div>', header)
    .replace('class="board-wrapper"', 'class="board-wrapper flex-column flex-grow"')
    .replace('</head>', `<style>
      .flex-row{display:flex}.flex-column{display:flex;flex-direction:column}.flex-grow{flex:1 1 auto}.flex-noshrink{flex-shrink:0}
      .bolt-header{padding:24px 16px 0;align-items:flex-start}
      .bolt-header:has(.bolt-tabbar){padding-top:0}
      .bolt-header-content-area{gap:12px}
      .bolt-header-title-row,.bolt-header-title button{height:42px}
      .bolt-header-title button{padding:6px 8px;font-size:18px;line-height:28px}
      .bolt-header-commandbar{display:flex;gap:4px;align-items:center}
      .bolt-header-commandbar>.bolt-button{min-height:33px}
      .bolt-tabbar{height:38px;align-items:center}
      .bolt-tabbar-tabs{padding-block:3px;gap:8px}
      .bolt-tab{height:32px}.bolt-tab-inner-container{display:flex;height:32px;align-items:center}
      .padding-16{padding:16px}.margin-horizontal-16{margin-inline:16px}
      .vss-FilterBar{display:flex;padding:8px;height:50px;gap:8px;align-items:center}
      .vss-FilterBar input{height:29px;flex:1;padding:5px}
      .vss-FilterBar button{height:33px;padding:6px 8px}
      .wit-card{padding:0;margin:8px 8px 0;min-height:0;position:relative;border:0;display:flex;flex-direction:row}
      .card-color{width:4px;flex:none;background:#00b7c3}
      .wit-card>.flex-column.flex-grow{padding:12px;border:1px solid #666;min-width:0}
      .card-title{display:flex}.card-title>div{display:block;width:100%}
      .font-weight-semibold{font-weight:600}.bolt-link{display:inline;color:inherit;text-decoration:none}
      .card-metadata{display:flex;flex-direction:column}
      .card-pair{display:flex;flex-direction:column}
      .work-item-state-container{display:flex;flex:1;width:220px;max-width:220px;margin-top:6px}
      .native-state-button{padding:2px 3px;height:22px;cursor:pointer}
      .work-item-state{display:flex;height:16px;gap:4px;align-items:center}
      .work-item-state-circle{width:8px;height:8px;border-radius:50%;background:#009ccc}
      .work-item-state-name{height:16px}
      .owner-row{display:flex}.native-owner-button{height:32px;padding-right:4px;width:100%;cursor:pointer}
      .identity-view{display:flex;margin-top:6px;height:20px;gap:4px;align-items:center}
      .identity-avatar{width:20px;height:20px;flex:none;background:#777;border-radius:50%}
      .identity-display-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .field-row{display:flex;flex-wrap:wrap;margin-top:2px}
      .field-container{display:flex;flex:1;align-items:center;height:20px;min-width:0}
      .field-label{width:40%;padding-top:1px;font-size:12px;line-height:16px}
      .native-field-value{width:60%;padding:1px 4px;height:20px;cursor:pointer}
      .margin-top-8{margin-top:8px}.flex-wrap{flex-wrap:wrap}
      .margin-bottom-8{margin-bottom:8px}.margin-right-8{margin-right:8px}
      .bolt-pill{display:flex;align-items:center;height:22px;background:#315b7d;border-radius:16px;padding-inline:8px}
      .bolt-pill-content{padding-block:2px;line-height:16px}
      .card-indicators>.bolt-button{display:flex;align-items:center;gap:2px;height:18px;padding:0 2px;color:inherit;background:none;border:0}
      .card-indicators>.bolt-button span{line-height:16px}
    </style></head>`)
    .replace('</body>', `<script>
      document.documentElement.dataset.nativeInteractions = '0';
      for (const control of document.querySelectorAll('.native-state-button,.native-owner-button,.native-field-value,.card-indicators button')) {
        control.addEventListener('click', () => { document.documentElement.dataset.nativeInteractions = String(Number(document.documentElement.dataset.nativeInteractions) + 1); });
      }
    </script></body>`);
}
