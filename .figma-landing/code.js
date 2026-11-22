async function build() {
  const [variables, collections, styles, dashboard, buttonSet] = await Promise.all([
    figma.variables.getLocalVariablesAsync(),
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.getLocalTextStylesAsync(),
    figma.getNodeByIdAsync('2264:1960'),
    figma.getNodeByIdAsync('2028:345')
  ]);
  const variable = (collection, name) => variables.find(v => v.name === name &&
    collections.some(c => c.id === v.variableCollectionId && c.name.includes(collection)));
  const color = (name, collection = 'Semantic Colors') => {
    const v = variable(collection, name);
    if (!v) throw new Error('Missing color: ' + name);
    const value = v.resolveForConsumer(dashboard).value;
    return figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:value.r,g:value.g,b:value.b}},'color',v);
  };
  const C = {
    white: color('Background/Primary'), soft: color('Brand/50','Brand'), pale: color('Brand/100','Brand'),
    brand: color('Brand/800','Brand'), action: color('Text/Brand'), ink: color('Text/Primary'),
    muted: color('Text/Secondary'), edge: color('Border/Primary'), inverse: color('Text/inverse'),
    faint: color('Brand/200','Brand')
  };
  const style = Object.fromEntries(styles.map(s => [s.name,s]));
  await Promise.all(styles.filter(s => s.fontName.family === 'DanaFaNum').map(s => figma.loadFontAsync(s.fontName)));
  const firstType = buttonSet.children[0].name.split(',')[0];
  const buttonMaster = buttonSet.children.find(n => n.name.startsWith(firstType + ',') &&
    n.name.includes('Appearance=Default') && n.name.includes('Size=Large')) || buttonSet.defaultVariant;
  if (!buttonMaster) throw new Error('Primary button variant unavailable');
  const page = figma.root.children.find(p=>/landing|لندینگ/i.test(p.name)) ||
    figma.root.children.find(p=>p.id==='0:1');
  await figma.setCurrentPageAsync(page);
  if (page.children.some(n=>n.name === 'Landing Page / پنل پذیرنده')) throw new Error('Landing already exists');
  const originalChildren = new Set(page.children.map(node=>node.id));
  const tasks = [];
  const bind = (node, field, collection, name) => {
    const v = variable(collection,name) || (name === 'Padding/MD' ? variable(collection,'Padding/M') : null);
    if (v) node.setBoundVariable(field,v);
  };
  const frame = (name,width,height,fill) => {
    const f=figma.createFrame();
    f.name=name; f.resize(width,height); f.fills=fill?[fill]:[];
    return f;
  };
  const round = (node, value, name) => {
    node.cornerRadius=value;
    for(const field of ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius'])
      bind(node,field,'Semantic Radius',name);
  };
  const stack = (name,width, children, options={}) => {
    const {horizontal=false, center=false, gap='Gap/MD', pad=null, fill=null, hug=false} = options;
    const f=frame(name,width || 10,10,fill);
    f.layoutMode=horizontal?'HORIZONTAL':'VERTICAL';
    f.primaryAxisSizingMode=horizontal&&!hug?'FIXED':'AUTO';
    f.counterAxisSizingMode=horizontal||hug?'AUTO':'FIXED';
    f.primaryAxisAlignItems=horizontal&&center?'CENTER':'MIN';
    f.counterAxisAlignItems=horizontal||center?'CENTER':'MAX';
    bind(f,'itemSpacing','Semantic Spacing',gap);
    if(pad) for (const key of ['paddingLeft','paddingRight','paddingTop','paddingBottom'])
      bind(f,key,'Semantic Spacing',pad);
    for (const child of children) f.appendChild(child);
    return f;
  };
  const txt = (value,type,paint=C.ink,width=null,align='RIGHT') => {
    const t=figma.createText();
    t.name=value.split('\n')[0];
    t.fontName=style[type].fontName;
    t.characters=value;
    t.textAlignHorizontal=align;
    t.fills=[paint];
    if(width){t.resize(width,20);t.textAutoResize='HEIGHT';}
    else t.textAutoResize='WIDTH_AND_HEIGHT';
    tasks.push(t.setTextStyleIdAsync(style[type].id));
    return t;
  };
  const at = (parent,node,x,y) => {parent.appendChild(node);node.x=x;node.y=y;return node;};
  const line = (name,w,paint=C.edge) => frame(name,w,1,paint);
  const stroke = (n, p=C.edge) => {n.strokes=[p];n.strokeWeight=1;n.strokeAlign='INSIDE';};
  const icon = (name,path,size,paint=C.action) => {
    const n=figma.createNodeFromSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#204CC5" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>');
    n.name=name; n.resize(size,size);
    for(const child of n.findAll(x=>x.type==='VECTOR')){
      if(child.strokes.length) child.strokes=[paint];
      else if(child.fills.length) child.fills=[paint];
    }
    return n;
  };
  const icons = {
    mark:'<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10h18M7 15h4"/>',
    chart:'<path d="M4 4v15a1 1 0 0 0 1 1h15M9 15v-3m4 3V8m4 7v-5"/>',
    link:'<path d="M10 13a4 4 0 0 0 6 .4l4-4a4 4 0 0 0-5.7-5.7l-2.3 2.3"/><path d="M14 11a4 4 0 0 0-6-.4l-4 4a4 4 0 0 0 5.7 5.7l2.3-2.3"/>',
    list:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    down:'<path d="M12 4v15m-5-5 5 5 5-5"/>'
  };
  const button = (label) => {
    const b=buttonMaster.createInstance(); b.name=label;
    const prop=Object.entries(b.componentProperties).find(entry=>entry[1].type==='TEXT');
    if(prop) b.setProperties({[prop[0]]:label});
    else {
      const t=b.findOne(n=>n.type==='TEXT');
      tasks.push((async()=>{await figma.loadFontAsync(t.fontName); t.characters=label;})());
    }
    return b;
  };
  const mark = () => {
    const node=frame('نشان پنل',40,40,C.brand); round(node,8,'md');
    at(node,icon('پرداخت',icons.mark,22,C.inverse),9,9);
    return node;
  };
  const brand = () => stack('هویت پنل',null,[txt('پنل پذیرنده','Body/MD/Strong'),mark()],
    {horizontal:true,hug:true,gap:'Gap/SM'});
  const jump = async (node,target) => node.setReactionsAsync([{
    trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:target.id,navigation:'SCROLL_TO',transition:null,preserveScrollPosition:false}]
  }]);
  let root;
  try {
    const navLogin = button('ورود به پنل');
    const navFeatures = txt('امکانات پنل','Label/LG',C.muted);
    const navPreview = txt('نمای داشبورد','Label/LG',C.muted);
    const nav = frame('Header / ناوبری',1440,80,C.white);
    const logo=brand(); at(nav,logo,1320-logo.width,20);
    const navItems=stack('پیوندهای صفحه',null,[navPreview,navFeatures],{horizontal:true,hug:true,gap:'Gap/XL'});
    at(nav,navItems,(1440-navItems.width)/2,29);
    at(nav,navLogin,120,(80-navLogin.height)/2);
    at(nav,line('مرز سربرگ',1440),0,79);

    const kicker = stack('عنوان محصول',null,[txt('پنل مدیریت پرداخت','Label/LG',C.action)],
      {horizontal:true,hug:true,pad:'Padding/xs',fill:C.pale});
    round(kicker,25,'Full');
    const heroLogin = button('ورود به پنل');
    const more=stack('دیدن داشبورد',null,[icon('پایین',icons.down,18),txt('دیدن داشبورد','Label/LG',C.action)],
      {horizontal:true,hug:true,gap:'Gap/SM',pad:'Padding/SM',fill:C.white});
    round(more,12,'md'); stroke(more);
    const headline=txt('پرداخت‌های کسب‌وکارتان\nدر یک پنل','Display',C.ink,940,'CENTER');
    const intro=stack('معرفی پنل',1440,[kicker,headline,
      txt('لینک پرداخت بسازید، وضعیت تراکنش‌ها را پیگیری کنید و گزارش فروش را در داشبورد ببینید.','Body/LG/Regular',C.muted,710,'CENTER'),
      stack('اقدام‌های اصلی',null,[more,heroLogin],{horizontal:true,hug:true,gap:'Gap/MD'})
    ],{center:true,gap:'Gap/LG'});
    const hero=frame('Hero / معرفی محصول',1440,445,C.soft);
    at(hero,intro,0,59);

    const preview=frame('Product Preview / پیش‌نمایش داشبورد',1440,633,C.soft);
    const shell=frame('قاب پیش‌نمایش',1120,574,C.white);round(shell,24,'xl');stroke(shell,C.faint);shell.clipsContent=true;
    const toolbar=frame('نوار پیش‌نمایش',1120,48,C.white);
    at(toolbar,txt('داشبورد پنل پذیرنده','Label/LG',C.ink,310),782,13);
    const sample=stack('برچسب دادهٔ نمونه',null,[txt('نمای نمونه','Label/SM',C.action)],{horizontal:true,hug:true,pad:'Padding/xs',fill:C.soft});
    round(sample,20,'Full');at(toolbar,sample,20,(48-sample.height)/2);
    at(toolbar,line('مرز پیش‌نمایش',1120),0,47);
    at(shell,toolbar,0,0);
    const window=frame('پنجره داشبورد',1120,526,C.white);window.clipsContent=true;
    const screen=dashboard.clone();window.appendChild(screen);screen.rescale(1120/dashboard.width);screen.x=0;screen.y=0;
    at(shell,window,0,48);at(preview,shell,160,0);

    const features=frame('Features / امکانات پنل',1440,441,C.white);
    const featuresIntro=stack('معرفی امکانات',1200,[
      txt('از ساخت لینک تا پیگیری پرداخت','Heading/H1',C.ink,1200),
      txt('ابزارهای روزمرهٔ مدیریت پرداخت در یک پنل در دسترس شماست.','Body/LG/Regular',C.muted,1200)
    ],{gap:'Gap/SM'});at(features,featuresIntro,120,62);
    const featureList=[
      ['گزارش فروش','روند پرداخت‌های موفق و مبلغ دریافتی را در داشبورد بررسی کنید.','chart'],
      ['پیگیری تراکنش‌ها','وضعیت هر پرداخت، مبلغ و زمان آن را در فهرست تراکنش‌ها ببینید.','list'],
      ['ساخت لینک پرداخت','مبلغ و تاریخ انقضا را مشخص کنید و لینک را برای مشتری بفرستید.','link']
    ];
    featureList.forEach(([title,description,glyph],i)=>{
      const tile=frame('آیکون ویژگی',48,48,C.pale);round(tile,12,'md');
      at(tile,icon(title,icons[glyph],24),12,12);
      const card=stack(title,384,[tile,txt(title,'Heading/H3',C.ink,328),
        txt(description,'Body/MD/Regular',C.muted,328)],
        {gap:'Gap/MD',pad:'Padding/L',fill:C.soft});
      round(card,18,'xl');stroke(card,C.faint);at(features,card,120+i*408,190);
    });

    const closing=frame('CTA / ورود به پنل',1440,347,C.white);
    const callout=frame('دعوت به ورود',1200,280,C.brand);round(callout,24,'xl');callout.clipsContent=true;
    for(const [size,x,y,opacity] of [[266,-44,56,0.35],[360,-91,9,0.26],[454,-138,-38,0.18]]){
      const e=figma.createEllipse();e.name='حلقه';e.resize(size,size);e.fills=[];e.strokes=[C.faint];e.strokeWeight=1;e.opacity=opacity;at(callout,e,x,y);
    }
    const endButton=stack('ورود به پنل',null,[txt('ورود به پنل','Body/MD/Strong',C.action)],
      {horizontal:true,hug:true,pad:'Padding/MD',fill:C.white});
    round(endButton,12,'md');
    const closeCopy=stack('متن دعوت به ورود',690,[
      txt('اولین لینک پرداختتان را بسازید','Heading/H1',C.inverse,690),
      txt('وارد پنل شوید و پرداخت‌های کسب‌وکارتان را مدیریت کنید.','Body/LG/Regular',C.inverse,690),
      endButton
    ],{gap:'Gap/LG'});at(callout,closeCopy,448,51);at(closing,callout,120,0);

    const footer=frame('Footer / پابرگ',1440,86,C.white);
    at(footer,line('مرز پابرگ',1200),120,0);
    const footBrand=brand();at(footer,footBrand,1320-footBrand.width,23);
    const footLink=txt('بازگشت به بالای صفحه','Label/MD',C.action);at(footer,footLink,120,31);
    root=stack('Landing Page / پنل پذیرنده',1440,[nav,hero,preview,features,closing,footer],{fill:C.white});
    root.counterAxisAlignItems='MIN';root.setBoundVariable('itemSpacing',null);root.itemSpacing=0;root.clipsContent=true;
    const section=figma.createSection();
    section.name='Landing Page';
    section.resizeWithoutConstraints(root.width+128,root.height+128);
    section.fills=[C.pale];
    const others=page.children.filter(n=>originalChildren.has(n.id));
    section.x=others.length?Math.max(...others.map(n=>n.x+n.width))+240:0;
    section.y=others.length?Math.min(...others.map(n=>n.y)):0;
    at(section,root,64,64);
    await Promise.all(tasks);
    await Promise.allSettled([jump(navFeatures,features),jump(navPreview,preview),jump(more,preview),jump(footLink,hero)]);
    page.selection=[root];figma.viewport.scrollAndZoomIntoView([root]);
    const bound = root.findAll(n=>n.boundVariables && Object.keys(n.boundVariables).length).length;
    figma.closePlugin('Landing '+root.id+' · '+bound+' token-bound layers');
  } catch(error) {
    for(const node of page.children) if(!originalChildren.has(node.id)) node.remove();
    throw error;
  }
}
async function polish() {
  const page=figma.root.children.find(p=>p.id==='0:1');
  await figma.setCurrentPageAsync(page);
  const section=page.children.find(n=>n.type==='SECTION'&&n.name==='Landing Page');
  const root=section.children.find(n=>n.name==='Landing Page / پنل پذیرنده');
  const [nav,hero,preview]=root.children;
  const labelStyle=(await figma.getLocalTextStylesAsync()).find(s=>s.name==='Label/LG');
  await figma.loadFontAsync(labelStyle.fontName);
  for(const area of [nav,hero]) {
    const cta=area.findOne(n=>n.type==='INSTANCE'&&n.name==='ورود به پنل');
    for(const t of cta.findAll(n=>n.type==='TEXT'&&n.visible)) {
      if(t.characters==='ورود به پنل') continue;
      const key=t.componentPropertyReferences && t.componentPropertyReferences.characters;
      if(key && cta.componentProperties[key]) cta.setProperties({[key]:'ورود به پنل'});
      else {
        t.fontName=labelStyle.fontName;
        t.characters='ورود به پنل';
      }
    }
  }
  hero.resize(hero.width,404);
  preview.resize(preview.width,800);
  const shell=preview.children[0];
  shell.resize(shell.width,741);
  const viewport=shell.children[1];
  viewport.resize(viewport.width,693);
  section.resizeWithoutConstraints(root.width+128,root.height+128);
  page.selection=[root];
  figma.viewport.scrollAndZoomIntoView([root]);
  const textNodes=root.findAll(n=>n.type==='TEXT'&&!n.parent.name.includes('نشان'));
  const dashboardText=new Set(viewport.findAll(n=>n.type==='TEXT').map(n=>n.id));
  const landingText=textNodes.filter(n=>!dashboardText.has(n.id));
  const fonts=[...new Set(landingText.map(n=>n.fontName.family))].filter(Boolean);
  const tokenCount=root.findAll(n=>n.boundVariables&&Object.keys(n.boundVariables).length>0).length;
  figma.closePlugin('Landing '+root.id+' · '+tokenCount+' bound layers · '+fonts.join(', '));
}
polish().catch(error=>figma.showUI('<pre>'+String(error).replace(/</g,'&lt;')+'</pre>',{width:650,height:160}));
