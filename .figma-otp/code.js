const SECTION_NAME = 'ورود و ثبت‌نام با OTP';
const COLLECTION = {
  color: 'Semantic Colors',
  brand: 'Brand',
  spacing: 'Semantic Spacing',
  radius: 'Semantic Radius',
  component: 'Component Token',
  type: 'Type Global',
};

async function build() {
  const page = figma.root.children.find(node => node.id === '0:1' && node.name === 'Fintech');
  if (!page) throw new Error('The Fintech page was not found.');
  await figma.setCurrentPageAsync(page);

  const existing = page.children.find(node => node.name === SECTION_NAME);
  if (existing) {
    await polish(page, existing);
    return;
  }

  const [variables, collections, styles, buttonSet, dashboard] = await Promise.all([
    figma.variables.getLocalVariablesAsync(),
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.getLocalTextStylesAsync(),
    figma.getNodeByIdAsync('2028:345'),
    figma.getNodeByIdAsync('2389:1817'),
  ]);
  const collectionsById = new Map(collections.map(collection => [collection.id, collection]));
  const anchor = page.children.find(node => node.id === '2417:2136');
  const consumer = anchor ?? dashboard;
  if (!consumer) throw new Error('No existing Fintech theme reference was found.');

  function token(collection, name) {
    const variable = variables.find(candidate =>
      candidate.name === name && collectionsById.get(candidate.variableCollectionId)?.name.includes(collection));
    if (!variable) throw new Error('Missing design token: ' + collection + ' / ' + name);
    return variable;
  }

  function resolve(variable) {
    return variable.resolveForConsumer(consumer).value;
  }

  function color(name, collection = COLLECTION.color) {
    const variable = token(collection, name);
    const {r, g, b, a = 1} = resolve(variable);
    return figma.variables.setBoundVariableForPaint(
      {type: 'SOLID', color: {r, g, b}, opacity: a}, 'color', variable);
  }

  const paints = {
    canvas: color('Background/Primary'),
    white: color('Surface/Primary'),
    ink: color('Text/Primary'),
    muted: color('Text/Secondary'),
    accent: color('Text/Brand'),
    edge: color('Border/Primary'),
    focus: color('Border/Brand'),
    alert: color('Text/error'),
    alertIcon: color('Icon/error'),
    alertBg: color('Background/error'),
    success: color('Text/success'),
    successBg: color('Background/success'),
    inverse: color('Text/inverse'),
    pale: color('Brand/50', COLLECTION.brand),
    soft: color('Brand/100', COLLECTION.brand),
    blue200: color('Brand/200', COLLECTION.brand),
    blue500: color('Brand/500', COLLECTION.brand),
    blue800: color('Brand/800', COLLECTION.brand),
    blue950: color('Brand/950', COLLECTION.brand),
  };

  const styleMap = new Map(styles.filter(style => style.fontName.family === 'DanaFaNum').map(style => [style.name, style]));
  function styleFor(patterns) {
    for (const pattern of patterns) {
      const style = [...styleMap.values()].find(candidate => pattern.test(candidate.name));
      if (style) return style;
    }
    throw new Error('Missing DanaFaNum text style: ' + patterns[0]);
  }
  const typography = {
    display: styleFor([/^Display/i, /^Heading/i]),
    heading: styleFor([/^Heading\/LG/i, /^Heading\/MD/i, /^Heading/i]),
    body: styleFor([/^Body\/MD$/i, /^Body\/MD/i, /^Body/i]),
    caption: styleFor([/^Body\/SM$/i, /^Label\/SM/i, /^Label/i]),
    label: styleFor([/^Label\/MD$/i, /^Label\/LG$/i, /^Label/i]),
  };
  const buttonMaster = buttonSet?.type === 'COMPONENT_SET'
    ? buttonSet.children.find(node => /Type=Primary/i.test(node.name)
      && /Appearance=Default/i.test(node.name) && /Size=Large/i.test(node.name))
      ?? buttonSet.children.find(node => /Appearance=Default/i.test(node.name) && /Size=Large/i.test(node.name))
      ?? buttonSet.defaultVariant
    : null;
  if (!buttonMaster) throw new Error('The existing Button component could not be found.');
  const fonts = Object.values(typography).map(style => style.fontName);
  const uniqueFonts = new Map(fonts.map(font => [font.family + '/' + font.style, font]));
  await Promise.all([...uniqueFonts.values()].map(font => figma.loadFontAsync(font)));

  const originalChildren = new Set(page.children.map(node => node.id));
  const textTasks = [];
  const reactions = [];
  const width = 1160;
  const height = 720;
  const formWidth = 404;
  const brandWidth = 440;

  function attach(parent, node, x = 0, y = 0) {
    parent.appendChild(node);
    node.x = x;
    node.y = y;
    return node;
  }

  function frame(parent, name, w, h, fill, x = 0, y = 0) {
    const node = figma.createFrame();
    node.name = name;
    node.resize(w, h);
    node.fills = fill ? [fill] : [];
    node.clipsContent = false;
    return attach(parent, node, x, y);
  }

  function radius(node, name) {
    const variable = token(COLLECTION.radius, name);
    node.cornerRadius = resolve(variable);
    for (const corner of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) {
      node.setBoundVariable(corner, variable);
    }
  }

  function border(node, paint, width = 1) {
    node.strokes = [paint];
    node.strokeAlign = 'INSIDE';
    node.strokeWeight = width;
  }

  function shape(parent, name, x, y, w, h, fill, round, stroke, ellipse = false) {
    const node = ellipse ? figma.createEllipse() : figma.createRectangle();
    node.name = name;
    node.resize(w, h);
    node.fills = fill ? [fill] : [];
    if (round) radius(node, round);
    if (stroke) border(node, stroke);
    return attach(parent, node, x, y);
  }

  function text(parent, value, type, paint, x, y, w, align = 'RIGHT') {
    const style = typography[type];
    const node = figma.createText();
    attach(parent, node, x, y);
    node.name = value;
    node.fontName = style.fontName;
    node.characters = value;
    node.textAlignHorizontal = align;
    node.fills = [paint];
    node.resize(w, 20);
    node.textAutoResize = 'HEIGHT';
    textTasks.push(node.setTextStyleIdAsync(style.id));
    return node;
  }

  function stack(parent, name, w, gapName, x = 0, y = 0, horizontal = false) {
    const node = frame(parent, name, w, 4, null, x, y);
    node.layoutMode = horizontal ? 'HORIZONTAL' : 'VERTICAL';
    node.primaryAxisSizingMode = horizontal ? 'FIXED' : 'AUTO';
    node.counterAxisSizingMode = horizontal ? 'AUTO' : 'FIXED';
    const gap = token(COLLECTION.spacing, gapName);
    node.itemSpacing = resolve(gap);
    node.setBoundVariable('itemSpacing', gap);
    return node;
  }

  function icon(parent, name, body, paint, x, y, size = 24, strokeWidth = 1.7) {
    const node = figma.createNodeFromSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="'
      + strokeWidth + '" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>');
    node.name = name;
    node.resize(size, size);
    for (const vector of node.findAll(child => child.type === 'VECTOR')) {
      if (vector.strokes.length) vector.strokes = [paint];
      if (vector.fills.length) vector.fills = [paint];
    }
    return attach(parent, node, x, y);
  }

  const icons = {
    card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18m-14 5h4"/>',
    phone: '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10 18h4"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  };

  function setTextProperty(instance, value) {
    const visibleText = instance.findAll(node => node.type === 'TEXT' && node.visible);
    for (const child of visibleText) {
      child.fontName = typography.label.fontName;
      const property = child.componentPropertyReferences?.characters;
      if (property && instance.componentProperties[property]) {
        instance.setProperties({[property]: value});
        return;
      }
    }
    if (visibleText.length !== 1) throw new Error('The button label could not be identified.');
    visibleText[0].characters = value;
  }

  function button(parent, value) {
    const node = attach(parent, buttonMaster.createInstance());
    node.name = value;
    setTextProperty(node, value);
    node.resize(formWidth, Math.max(52, node.height));
    return node;
  }

  function component(parent, name, w, h, fill, x, y) {
    const node = figma.createComponent();
    node.name = name;
    node.resize(w, h);
    node.fills = fill ? [fill] : [];
    node.clipsContent = true;
    return attach(parent, node, x, y);
  }

  function brandPanel(parent, x, y) {
    const node = component(parent, 'OTP / پنل هویت', brandWidth, height, paints.blue950, x, y);
    shape(node, 'مدار بیرونی', -106, -172, 652, 652, null, null, paints.blue800, true);
    shape(node, 'مدار داخلی', -51, -117, 542, 542, null, null, paints.blue800, true);
    shape(node, 'هاله نشان', 94, 92, 252, 252, paints.blue800, null, null, true);
    shape(node, 'زمینهٔ تلفن', 153, 112, 134, 214, paints.blue950, 'xl', paints.blue500);
    shape(node, 'صفحهٔ تلفن', 163, 122, 114, 194, paints.pale, 'lg');
    shape(node, 'بلندگوی تلفن', 197, 132, 46, 5, paints.blue200, 'Full');
    shape(node, 'نشان قفل', 192, 158, 56, 56, paints.soft, null, null, true);
    icon(node, 'قفل', icons.lock, paints.blue800, 208, 174, 24);
    shape(node, 'زمینهٔ رمز', 128, 226, 184, 54, paints.white, 'md', paints.blue200);
    for (let index = 0; index < 6; index += 1) {
      shape(node, 'نقطهٔ رمز', 154 + index * 24, 249, 8, 8, paints.blue800, null, null, true);
    }
    shape(node, 'نشان هویت', 348, 481, 48, 48, paints.blue800, 'md');
    icon(node, 'پرداخت', icons.card, paints.inverse, 360, 493);
    text(node, 'پنل پذیرنده', 'display', paints.inverse, 44, 545, 352);
    text(node, 'مدیریت پرداخت‌های کسب‌وکار', 'body', paints.blue200, 44, 619, 352);
    return node;
  }

  function digitComponent(parent, name, stroke, x, y) {
    const node = component(parent, name, 59, 56, paints.white, x, y);
    radius(node, 'md');
    border(node, stroke, name.endsWith('خالی') ? 1 : 1.5);
    text(node, '–', 'label', paints.muted, 0, 16, 59, 'CENTER');
    return node;
  }

  function setDigits(parent, masters, values, status) {
    const row = stack(parent, 'کد شش‌رقمی', formWidth, 'Gap/SM', 0, 0, true);
    for (let index = 0; index < 6; index += 1) {
      const master = status === 'error' ? masters.error : index === 0 && !values ? masters.active : masters.empty;
      const instance = attach(row, master.createInstance());
      if (values) {
        const child = instance.findOne(node => node.type === 'TEXT');
        child.characters = values[index];
        child.fills = [status === 'error' ? paints.alert : paints.ink];
      }
    }
    return row;
  }

  function header(parent, title, description, kind) {
    const group = stack(parent, 'عنوان و راهنما', formWidth, 'Gap/SM');
    const tile = frame(group, 'نشان مرحله', formWidth, 58, null);
    const good = kind === 'success';
    shape(tile, 'زمینهٔ نشان', formWidth - 58, 0, 58, 58,
      good ? paints.successBg : paints.pale, 'lg');
    icon(tile, kind, icons[kind], good ? paints.success : paints.accent, formWidth - 42, 16, 26);
    text(group, title, 'heading', paints.ink, 0, 0, formWidth);
    text(group, description, 'body', paints.muted, 0, 0, formWidth);
    return group;
  }

  function link(parent, value, x, y, w) {
    return text(parent, value, 'label', paints.accent, x, y, w);
  }

  function notice(parent, value) {
    const row = frame(parent, 'پیام خطا', formWidth, 46, paints.alertBg);
    radius(row, 'md');
    icon(row, 'خطا', icons.info, paints.alertIcon, formWidth - 34, 13, 20);
    text(row, value, 'caption', paints.alert, 12, 12, formWidth - 55);
    return row;
  }

  function makeScreen(section, name, index, brand) {
    const row = Math.floor(index / 3);
    const col = index % 3;
    const screen = frame(section, name, width, height, paints.canvas,
      64 + col * (width + 48), 80 + row * (height + 64));
    screen.clipsContent = true;
    attach(screen, brand.createInstance());
    shape(screen, 'کارت فرم', 544, 62, 512, 596, paints.white, 'xl', paints.edge);
    return screen;
  }

  function appLink(source, destination) {
    reactions.push([source, destination]);
  }

  try {
    const section = figma.createSection();
    section.name = SECTION_NAME;
    section.fills = [paints.soft];
    section.resizeWithoutConstraints(3704, 2500);
    const top = Math.ceil(anchor?.y ?? 0);
    const right = Math.max(...page.children.filter(node => originalChildren.has(node.id)).map(node => node.x + node.width));
    section.x = Math.ceil(right + 240);
    section.y = top;

    const masters = frame(section, 'کامپوننت‌های مستقل OTP', 702, 764, paints.canvas, 1280, 1648);
    radius(masters, 'xl');
    const brand = brandPanel(masters, 22, 22);
    const digits = {
      empty: digitComponent(masters, 'OTP / رقم خالی', paints.edge, 484, 24),
      active: digitComponent(masters, 'OTP / رقم فعال', paints.focus, 550, 24),
      error: digitComponent(masters, 'OTP / رقم خطا', paints.alert, 616, 24),
    };

    const phone = makeScreen(section, '۰۱ · ورود شماره موبایل', 0, brand);
    const phoneForm = stack(phone, 'فرم ورود شماره', formWidth, 'Gap/XL', 598, 145);
    header(phoneForm, 'ورود یا ثبت‌نام', 'شماره موبایل خود را وارد کنید تا کد تأیید برایتان پیامک شود.', 'phone');
    const phoneField = stack(phoneForm, 'شماره موبایل', formWidth, 'Gap/xs');
    text(phoneField, 'شماره موبایل', 'label', paints.ink, 0, 0, formWidth);
    const input = frame(phoneField, 'فیلد شماره موبایل', formWidth, 54, paints.white);
    radius(input, 'md');
    border(input, paints.focus, 1.5);
    text(input, '۰۹۱۲۳۴۵۶۷۸۹', 'label', paints.ink, 16, 15, formWidth - 60, 'LEFT');
    icon(input, 'موبایل', icons.phone, paints.accent, formWidth - 39, 15);
    const request = button(phoneForm, 'دریافت کد تأیید');

    function otpScreen(name, index, settings) {
      const screen = makeScreen(section, name, index, brand);
      const back = link(screen, 'بازگشت', 915, 92, 86);
      icon(screen, 'بازگشت', icons.arrow, paints.accent, 1011, 93, 20);
      const form = stack(screen, 'فرم تأیید شماره', formWidth, 'Gap/LG', 598, 142);
      header(form, 'تأیید شماره موبایل', 'کد ۶ رقمی به شمارهٔ زیر پیامک شد.', 'lock');
      const number = frame(form, 'شماره و امکان ویرایش', formWidth, 26, null);
      text(number, '۰۹۱۲۳۴۵۶۷۸۹', 'label', paints.ink, 196, 0, 208);
      const edit = link(number, 'تغییر شماره', 0, 0, 114);
      const fields = stack(form, 'رمز یک‌بارمصرف', formWidth, 'Gap/xs');
      text(fields, 'کد تأیید', 'label', paints.ink, 0, 0, formWidth);
      setDigits(fields, digits, settings.values, settings.error ? 'error' : 'normal');
      if (settings.error) notice(form, settings.error);
      const verify = button(form, 'تأیید و ادامه');
      const footer = frame(form, 'ارسال مجدد', formWidth, 28, null);
      let resend;
      if (settings.canResend) {
        resend = link(footer, 'ارسال مجدد کد', 244, 1, 160);
      } else {
        text(footer, 'ارسال مجدد تا ۰۰:۴۲ دیگر', 'caption', paints.muted, 0, 2, formWidth);
      }
      appLink(back, phone);
      appLink(edit, phone);
      return {screen, verify, resend};
    }

    const sent = otpScreen('۰۲ · ورود کد و شمارش معکوس', 1, {values: '۳۸۱۶۲۴'});
    const incorrect = otpScreen('۰۳ · کد اشتباه', 2,
      {values: '۳۸۱۶۲۸', error: 'کد واردشده اشتباه است. دوباره امتحان کنید.'});
    const expired = otpScreen('۰۴ · کد منقضی', 3,
      {values: '۳۸۱۶۲۴', error: 'اعتبار کد تمام شده است. یک کد جدید بگیرید.', canResend: true});
    const ready = otpScreen('۰۵ · ارسال مجدد', 4, {canResend: true});

    function completeScreen(name, index, title, description) {
      const screen = makeScreen(section, name, index, brand);
      const form = stack(screen, 'نتیجهٔ تأیید', formWidth, 'Gap/XL', 598, 218);
      header(form, title, description, 'success');
      const next = button(form, 'رفتن به صفحه اصلی');
      if (dashboard) appLink(next, dashboard);
      return screen;
    }

    const login = completeScreen('۰۶ · ورود به حساب موجود', 5,
      'با موفقیت وارد شدید', 'شماره موبایل تأیید شد و حساب شما آمادهٔ استفاده است.');
    completeScreen('۰۷ · ثبت‌نام و ورود', 6,
      'حساب شما ساخته شد', 'ثبت‌نام کامل شد و اکنون وارد پنل پذیرنده شده‌اید.');

    appLink(request, sent.screen);
    appLink(sent.verify, login);
    appLink(incorrect.verify, sent.screen);
    appLink(expired.resend, sent.screen);
    appLink(ready.resend, sent.screen);

    await Promise.all(textTasks);
    await Promise.all(reactions.map(([node, destination]) => node.setReactionsAsync([{
      trigger: {type: 'ON_CLICK'},
      actions: [{type: 'NODE', destinationId: destination.id, navigation: 'NAVIGATE',
        transition: null, preserveScrollPosition: false}],
    }])));

    const screens = section.children.filter(node => /^۰/.test(node.name));
    const bindings = section.findAll(node => Object.keys(node.boundVariables ?? {}).length).length;
    const clips = screens.flatMap(screen => screen.children.filter(node =>
      node.x + node.width > screen.width + 1 || node.y + node.height > screen.height + 1));
    if (screens.length !== 7 || bindings < 40 || clips.length) {
      throw new Error('Unexpected screen, token, or layout validation result.');
    }
    await polish(page, section);
  } catch (error) {
    for (const node of [...page.children]) {
      if (!originalChildren.has(node.id)) node.remove();
    }
    throw error;
  }
}

async function polish(page, section) {
  const [variables, collections, dashboard] = await Promise.all([
    figma.variables.getLocalVariablesAsync(),
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.getNodeByIdAsync('2389:1817'),
  ]);

  const collection = collections.find(node => node.name.includes(COLLECTION.type));
  const sizes = Object.fromEntries(variables.filter(variable => variable.variableCollectionId === collection?.id)
    .map(variable => [variable.name, variable]));
  const headings = new Set(['ورود یا ثبت‌نام', 'تأیید شماره موبایل', 'با موفقیت وارد شدید', 'حساب شما ساخته شد']);
  const captions = /^(ارسال مجدد تا |کد واردشده |اعتبار کد )/;
  const masters = section.children.find(node => node.name === 'کامپوننت‌های مستقل OTP');
  const screens = section.children.filter(node => /^۰/.test(node.name)).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  const labels = [
    ...masters.findAll(node => node.type === 'TEXT'),
    ...screens.flatMap(screen => screen.findAll(node => node.type === 'TEXT'
      && !node.parent.name.startsWith('OTP /'))),
  ];
  const fonts = new Map(labels.map(node => [node.fontName.family + '/' + node.fontName.style, node.fontName]));
  await Promise.all([...fonts.values()].map(font => figma.loadFontAsync(font)));

  for (const label of labels) {
    const sizeName = label.characters === 'پنل پذیرنده' ? 'size/4xl'
      : headings.has(label.characters) ? 'size/3xl' : captions.test(label.characters) ? 'size/sm' : 'size/base';
    const variable = sizes[sizeName];
    if (!variable) throw new Error('Missing font size variable: ' + sizeName);
    const size = variable.resolveForConsumer(section).value;
    label.fontSize = size;
    label.lineHeight = {unit: 'PIXELS', value: size === 36 ? 52 : size === 30 ? 44 : size === 14 ? 22 : 24};
    label.setBoundVariable('fontSize', variable);
    if (label.characters === 'مدیریت پرداخت‌های کسب‌وکار') label.y = 608;
  }

  for (const screen of screens) {
    const form = screen.children.find(node => /^(فرم |نتیجهٔ تأیید)/.test(node.name));
    form.y = Math.max(screen.name.includes('شماره موبایل') ? 154 : 138, Math.round((720 - form.height) / 2));
  }

  const sent = screens.find(node => node.name.startsWith('۰۲'));
  const ready = screens.find(node => node.name.startsWith('۰۵'));
  const timeout = (screen, target, timeout) => screen.setReactionsAsync([{
    trigger: {type: 'AFTER_TIMEOUT', timeout},
    actions: [{type: 'NODE', destinationId: target.id, navigation: 'NAVIGATE', transition: null,
      preserveScrollPosition: false}],
  }]);
  if (sent && ready) await timeout(sent, ready, 42);
  if (dashboard?.type === 'FRAME') {
    for (const screen of screens.filter(node => /^۰[۶۷]/.test(node.name))) await timeout(screen, dashboard, 2);
  }
  const bindings = section.findAll(node => Object.keys(node.boundVariables ?? {}).length).length;
  page.selection = [section];
  figma.viewport.scrollAndZoomIntoView([section]);
  figma.closePlugin('OTP: 7 screens · ' + bindings + ' token-bound layers · ' + section.id);
}

build().catch(error => {
  const message = String(error.message ?? error);
  figma.showUI('<pre style="white-space:pre-wrap">' + message.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    + '</pre>', {width: 530, height: 135});
});
