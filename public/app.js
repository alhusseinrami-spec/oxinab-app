/* Oxinab catalogue app: catalogue, order basket (sent on WhatsApp), install and offers. */
const TR={"Language":"اللغة","Updated":"آخر تحديث","Products":"المنتجات","How to order":"طريقة الطلب","Contact":"اتصل بنا","Order":"طلبي",
"Preview: sample products. The real Oxinab catalogue is coming soon.":"نسخة تجريبية: منتجات للعرض فقط. كتالوج أوكسيناب الكامل قريباً.",
"Emergency, medical and home health supplies.":"مستلزمات الطوارئ والمستلزمات الطبية والصحة المنزلية.",
"EMS and first aid, burn care, oxygen, diagnostics and home health. Find an item by name or reference, build your order, and send it on WhatsApp.":"الإسعاف والإسعافات الأولية، علاج الحروق، الأكسجين، أدوات التشخيص والصحة المنزلية. ابحث عن المنتج بالاسم أو بالرقم المرجعي، كوّن طلبك وأرسله عبر واتساب.",
"Search e.g. Burnshield, insole, thermometer":"ابحث مثلاً: Burnshield، نعل طبي، ميزان حرارة","Search":"بحث",
"Delivery all over Lebanon":"توصيل إلى كل لبنان","Order on WhatsApp":"اطلب عبر واتساب","Cash on Delivery":"الدفع عند الاستلام",
"Product catalogue":"كتالوج المنتجات","Choose your items":"اختر منتجاتك","Add products to your order. Each one has a reference number.":"أضف المنتجات إلى طلبك. لكل منتج رقم مرجعي.",
"Send your order":"أرسل طلبك","Tap send on WhatsApp, or message +961 76 878 113.":"أرسله عبر واتساب، أو راسلنا على ‎+961 76 878 113.",
"Confirm delivery":"تأكيد التوصيل","We confirm availability, price and delivery with you.":"نؤكد معك توفر المنتج والسعر والتوصيل.",
"Pay on delivery":"الدفع عند الاستلام","Pay cash when your order arrives.":"ادفع نقداً عند وصول طلبك.",
"Medical supplies | Lebanon":"مستلزمات طبية | لبنان","Order and enquiries":"الطلبات والاستفسارات","WhatsApp:":"واتساب:",
"Delivery and payment":"التوصيل والدفع",
"Prices are indicative; the final price is confirmed when you order. Product appearance and packaging may vary. Please quote the reference number when ordering.":"الأسعار تقريبية، ويتم تأكيد السعر النهائي عند الطلب. قد يختلف شكل المنتج وتغليفه. يرجى ذكر الرقم المرجعي عند الطلب.",
"Your order":"طلبك","Your details (optional) help us prepare your order.":"بياناتك (اختيارية) تساعدنا في تجهيز طلبك.","Your name":"الاسم","Phone number":"رقم الهاتف","Area / address for delivery":"المنطقة / عنوان التوصيل","Send order on WhatsApp":"أرسل الطلب عبر واتساب",
"Pay cash on delivery. We confirm availability, price and delivery on WhatsApp.":"الدفع نقداً عند الاستلام. نؤكد التوفر والسعر والتوصيل عبر واتساب.",
"All":"الكل","Add":"أضف","Ask for a quote":"اطلب السعر","product":"منتج","products":"منتجات",
"No match. Message us on WhatsApp and we will check availability for you.":"لا توجد نتائج. راسلنا على واتساب وسنتحقق من التوفر لك.",
"Your order is empty. Add products from the catalogue.":"طلبك فارغ. أضف منتجات من الكتالوج.","Estimated total":"المجموع التقريبي","Items":"عدد القطع",
"Remove one":"إزالة واحدة","Add one":"إضافة واحدة","Open your order":"افتح طلبك","Close":"إغلاق","Search products":"ابحث عن منتج",
"Oxinab Catalogue":"كتالوج أوكسيناب","Shop now":"تسوّق الآن","Brands and offers":"العلامات التجارية والعروض","Previous slide":"الشريحة السابقة","Next slide":"الشريحة التالية","Slide":"الشريحة","of":"من"};
Object.assign(TR,{"Out of stock":"غير متوفر","left":"متبقٍ فقط","Only":"","Install the app":"ثبّت التطبيق","Get offers on your phone":"احصل على العروض على هاتفك","Offers are on":"العروض مفعّلة",
"Install Oxinab on your iPhone":"ثبّت أوكسيناب على الآيفون","Tap the Share button at the bottom of Safari.":"اضغط على زر المشاركة أسفل Safari.","Choose Add to Home Screen, then Add.":"اختر «إضافة إلى الشاشة الرئيسية» ثم «إضافة».","Open Oxinab from your home screen.":"افتح أوكسيناب من الشاشة الرئيسية.","OK":"حسناً",
"To get offers on iPhone, first add Oxinab to your home screen, then open it from there.":"لتلقي العروض على الآيفون، أضف أوكسيناب أولاً إلى الشاشة الرئيسية ثم افتحه من هناك.",
"You will get Oxinab offers on this phone.":"ستصلك عروض أوكسيناب على هذا الهاتف.","Notifications are blocked. Allow them in your phone settings for this site.":"الإشعارات محظورة. اسمح بها من إعدادات الهاتف لهذا الموقع.","Could not turn on offers. Please try again.":"تعذّر تفعيل العروض. حاول مرة أخرى.","Offers turned off on this phone.":"تم إيقاف العروض على هذا الهاتف."});
const TITLE='Oxinab Catalogue', CUR='$';
let D=null,CATS=[],P=[],byId={},cnt=[],SHOW_PRICES=false,WA='96176878113',LOW=0;
let LANG='en';try{LANG=localStorage.getItem('oxl')||((navigator.language||'').slice(0,2)==='ar'?'ar':'en')}catch(e){}
const bi=s=>s.replace(/[A-Za-z0-9][A-Za-z0-9×*\/.,\-+%' ]*[A-Za-z0-9%]|[A-Za-z0-9]/g,'⁦$&⁩');
const t=s=>LANG==='ar'&&TR[s]?bi(TR[s]):s;
const nm=p=>LANG==='ar'?bi(p.a||p.n):p.n,ds=p=>LANG==='ar'?bi(p.ad||p.d||''):(p.d||''),cnm=i=>LANG==='ar'&&CATS[i].a?CATS[i].a:CATS[i].n;
const $=id=>document.getElementById(id),esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const money=v=>CUR+v.toFixed(2),qty=()=>Object.values(cart).reduce((a,b)=>a+b,0);
const tot=()=>Object.keys(cart).reduce((s,k)=>s+byId[k].pr*cart[k],0);
const save=()=>{try{localStorage.setItem('oxc',JSON.stringify(cart))}catch(e){}};
const out=p=>p.s===0;
let cart={},cat=-1,q='';
const newOID=()=>{const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',r=crypto.getRandomValues(new Uint8Array(6));return Array.from(r,x=>c[x%c.length]).join('')};
let OID=newOID();
const who=()=>({name:($('u_n').value||'').trim(),phone:($('u_p').value||'').trim(),addr:($('u_a').value||'').trim()});
function toast(m){const o=document.createElement('div');o.className='toast';o.textContent=m;document.body.appendChild(o);setTimeout(()=>o.remove(),3500)}

function stat(){
 const h=document.documentElement;h.lang=LANG;h.dir=LANG==='ar'?'rtl':'ltr';
 const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
 while(n=w.nextNode()){
  if(n.parentElement.closest('script,style,#ptrack,#pdots,#g,#chips,#tabs,#ci,#tt,#cnt,#gi,#cn,#upd,.sheet,.toast'))continue;
  if(n._o===undefined)n._o=n.nodeValue;
  const k=n._o.trim();if(!k)continue;
  n.nodeValue=LANG==='ar'&&TR[k]?n._o.replace(k,t(k)):n._o;
 }
 document.querySelectorAll('[placeholder],[aria-label]').forEach(e=>{
  if(e.closest('#g,#ci'))return;
  ['placeholder','aria-label'].forEach(a=>{if(e.hasAttribute(a)){const d='data-o-'+a;if(!e.hasAttribute(d))e.setAttribute(d,e.getAttribute(a));e.setAttribute(a,t(e.getAttribute(d)))}});
 });
 document.title=t(TITLE);updTxt();$('lg').textContent=LANG==='ar'?'EN':'عربي';
}
function setLang(){LANG=LANG==='ar'?'en':'ar';try{localStorage.setItem('oxl',LANG)}catch(e){}stat();all()}
function all(){if(!D)return;promo();chips();draw();drawCart()}

function load(d){
 D=d;CATS=d.cats;SHOW_PRICES=!!d.set.price;WA=d.set.wa||WA;LOW=d.set.low||0;
 P=d.items.filter(i=>!i.off&&CATS[i.k]).map(i=>({id:i.id,n:i.n,a:i.a,d:i.d,ad:i.ad,pr:i.p||0,s:i.s==null?0:i.s,ci:i.k,im:i.im}));
 byId={};P.forEach(p=>byId[p.id]=p);cnt=CATS.map((c,i)=>P.filter(p=>p.ci===i).length);
 const c0=cart;cart={};
 try{const s=Object.keys(c0).length?c0:JSON.parse(localStorage.getItem('oxc')||'{}');for(const k in s){if(byId[k]&&!out(byId[k])&&s[k]>0)cart[k]=s[k]}}catch(e){}
 if(cat>=CATS.length)cat=-1;
 updTxt();all();
}
function stepper(id){return `<div class="st"><button onclick="ch('${id}',-1)" aria-label="${t('Remove one')}">−</button><span>${cart[id]}</span><button onclick="ch('${id}',1)" aria-label="${t('Add one')}">+</button></div>`}
function stock(p){if(p.s==null)return '';if(p.s===0)return `<span class="sb out">${t('Out of stock')}</span>`;if(LOW&&p.s<=LOW)return `<span class="sb low">${LANG==='ar'?t('left')+' '+p.s:'Only '+p.s+' left'}</span>`;return ''}
function card(p){const c=CATS[p.ci];
return `<article class="pc" style="--c:${c.c}"><div class="th${p.im?' ph':''}">${p.im?`<img src="${esc(p.im)}" alt="${esc(nm(p))}" loading="lazy" decoding="async">`:`<span aria-hidden="true">${c.e}</span>`}</div><div class="pb"><span class="rf">${p.id}</span>${stock(p)}<div style="flex:1"><h3>${esc(nm(p))}</h3>${ds(p)?`<p class="ds">${esc(ds(p))}</p>`:''}</div><div class="ft">${SHOW_PRICES&&p.pr?`<b dir="ltr">${money(p.pr)}</b>`:`<span class="mu sm">${t('Ask for a quote')}</span>`}${cart[p.id]?stepper(p.id):`<button class="ad" onclick="ch('${p.id}',1)" ${out(p)?'disabled':''}>${t('Add')}</button>`}</div></div></article>`}
function draw(){
 const f=P.filter(p=>(cat<0||p.ci===cat)&&(p.id+' '+p.n+' '+(p.a||'')+' '+(p.d||'')).toLowerCase().includes(q));
 $('g').innerHTML=f.length?f.map(card).join(''):'<p class="mu">'+t('No match. Message us on WhatsApp and we will check availability for you.')+'</p>';
 $('cnt').textContent=f.length+' '+t(f.length===1?'product':'products');
}
function drawCart(){
 const ks=Object.keys(cart),pr=SHOW_PRICES&&ks.every(k=>byId[k].pr>0);
 $('cn').textContent=qty();
 $('ci').innerHTML=ks.length?ks.map(k=>{const p=byId[k];return `<div class="it" style="--c:${CATS[p.ci].c}"><div><b>${esc(nm(p))}</b><span class="mu sm" dir="ltr">${p.id}${SHOW_PRICES&&p.pr?' · '+money(p.pr):''}</span></div>${stepper(k)}</div>`}).join(''):'<p class="mu">'+t('Your order is empty. Add products from the catalogue.')+'</p>';
 $('tt').innerHTML=pr?`<span>${t('Estimated total')}</span><span dir="ltr">${money(tot())}</span>`:`<span>${t('Items')}</span><span>${qty()}</span>`;
 const a=$('wa');a.classList.toggle('off',!ks.length);
 const U=who(),ul=LANG==='ar'?[U.name&&'الاسم: '+U.name,U.phone&&'الهاتف: '+U.phone,U.addr&&'العنوان: '+U.addr]:[U.name&&'Name: '+U.name,U.phone&&'Phone: '+U.phone,U.addr&&'Address: '+U.addr];
 const head=(LANG==='ar'?'طلب رقم ':'Order #')+OID+'\n',tail=ul.filter(Boolean).length?'\n'+ul.filter(Boolean).join('\n'):'';
 const msg=head+(LANG==='ar'?'مرحباً أوكسيناب، أود طلب:\n'+ks.map(k=>'• '+k+' - '+(byId[k].a||byId[k].n)+' × '+cart[k]).join('\n')+(pr?'\nالمجموع التقريبي: '+money(tot()):'')+'\nالدفع: عند الاستلام':'Hello Oxinab, I would like to order:\n'+ks.map(k=>'• '+k+' - '+byId[k].n+' x '+cart[k]).join('\n')+(pr?'\nEstimated total: '+money(tot()):'')+'\nPayment: Cash on Delivery')+tail;
 a.href=ks.length?'https://wa.me/'+WA+'?text='+encodeURIComponent(msg):'#';
}
/* ===== Brands and offers slider (slides are managed in the command center) ===== */
let SL=[],SI=0,SLK='';
const RM=matchMedia('(prefers-reduced-motion: reduce)');
function promo(){
 SL=(D.banners||[]).filter(b=>b.on&&(b.im||b.t));
 const box=$('promo'),tr=$('ptrack'),k=JSON.stringify(SL)+LANG;
 box.hidden=!SL.length;if(!SL.length||k===SLK)return;SLK=k;
 const L=(b,f)=>LANG==='ar'&&b[f+'a']?b[f+'a']:b[f];
 tr.innerHTML=SL.map((b,i)=>{const tx=L(b,'t'),sb=L(b,'s'),lb=L(b,'l');
  return `<${b.go?'a href="#shop"':'div'} class="slide${tx?'':' bare'}" data-i="${i}" style="--bg:${esc(b.bg||'#001765')}" dir="${LANG==='ar'?'rtl':'ltr'}" role="group" aria-roledescription="slide" aria-label="${t('Slide')} ${i+1} ${t('of')} ${SL.length}${tx?': '+esc(tx):''}">`
  +(tx||sb?`<div class="sx">${lb?`<span class="sl">${esc(lb)}</span>`:''}${tx?`<h2>${esc(tx)}</h2>`:''}${sb?`<p>${esc(sb)}</p>`:''}${b.go?`<span class="scta">${t('Shop now')} <i aria-hidden="true">${LANG==='ar'?'←':'→'}</i></span>`:''}</div>`:'')
  +(b.im?`<div class="si"><img src="${esc(b.im)}" alt="" ${i?'loading="lazy"':''} decoding="async"></div>`:'')
  +`</${b.go?'a':'div'}>`}).join('');
 tr.querySelectorAll('.si img').forEach(im=>{const w=()=>{if(im.naturalWidth/im.naturalHeight>=1.8)im.closest('.slide').classList.add('wide')};im.complete?w():im.onload=w});
 $('pdots').innerHTML=SL.length>1?SL.map((b,i)=>`<button data-i="${i}" aria-label="${t('Slide')} ${i+1}"><i></i></button>`).join(''):'';
 box.classList.toggle('one',SL.length<2);
 SI=Math.min(SI,SL.length-1);tr.scrollLeft=SI*tr.clientWidth;mark(SI);
}
function mark(i){SI=i;$('ptrack').querySelectorAll('.slide').forEach((s,j)=>{s.classList.toggle('on',j===i);s.inert=j!==i});
 $('pdots').querySelectorAll('button').forEach((d,j)=>{d.classList.toggle('on',j===i);d.setAttribute('aria-current',j===i?'true':'false');const f=d.firstChild;f.style.animation='none';void f.offsetWidth;f.style.animation=''})}
function slideTo(i){const tr=$('ptrack'),n=SL.length;if(!n)return;i=(i+n)%n;tr.scrollTo({left:i*tr.clientWidth,behavior:RM.matches?'auto':'smooth'});mark(i)}
{const tr=$('ptrack'),box=$('promo');let st;
 tr.addEventListener('scroll',()=>{clearTimeout(st);st=setTimeout(()=>{const i=Math.round(tr.scrollLeft/tr.clientWidth);if(i!==SI&&SL[i])mark(i)},90)},{passive:true});
 $('pdots').onclick=e=>{const b=e.target.closest('button');if(b)slideTo(+b.dataset.i)};
 box.querySelectorAll('.pnav').forEach(b=>b.onclick=()=>slideTo(SI+ +b.dataset.d));
 // The active dot fills over a few seconds; when it is full the next slide comes in. Touching or hovering pauses it.
 $('pdots').addEventListener('animationend',e=>{if(e.target.parentElement.classList.contains('on'))slideTo(SI+1)});
 const hold=v=>box.classList.toggle('hold',v);let ht;
 box.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')hold(true)});box.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')hold(false)});
 box.addEventListener('touchstart',()=>{hold(true);clearTimeout(ht)},{passive:true});box.addEventListener('touchend',()=>{clearTimeout(ht);ht=setTimeout(()=>hold(false),4000)},{passive:true});
 box.addEventListener('focusin',()=>hold(true));box.addEventListener('focusout',()=>hold(false));
 addEventListener('resize',()=>{tr.scrollLeft=SI*tr.clientWidth});
 tr.onclick=e=>{const a=e.target.closest('a.slide');if(!a)return;const b=SL[+a.dataset.i];if(!b||!b.go)return;e.preventDefault();
  const m=/^c(\d+)$/.exec(b.go);if(m&&CATS[+m[1]]){q='';$('hq').value='';cat=+m[1];chips();draw()}else if(b.go.startsWith('q:'))search(b.go.slice(2));
  $('shop').scrollIntoView({behavior:RM.matches?'auto':'smooth'})};
}

/* Order number and customer details */
try{const u=JSON.parse(localStorage.getItem('oxu')||'{}');$('u_n').value=u.name||'';$('u_p').value=u.phone||'';$('u_a').value=u.addr||''}catch(e){}
$('cu').addEventListener('input',()=>{try{localStorage.setItem('oxu',JSON.stringify(who()))}catch(e){}drawCart()});
$('wa').addEventListener('click',()=>{
 const ks=Object.keys(cart);if(!ks.length)return;
 const body=JSON.stringify({id:OID,lang:LANG,...who(),items:ks.map(k=>({id:k,q:cart[k]}))});
 try{fetch('/api/order',{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true}).catch(()=>{})}catch(e){}
 setTimeout(()=>{OID=newOID();drawCart()},800); // the next order gets its own number
});
function ch(id,d){const p=byId[id];if(!p)return;let n=Math.max(0,(cart[id]||0)+d);if(p.s!=null)n=Math.min(n,p.s);cart[id]=n;if(!cart[id])delete cart[id];save();draw();drawCart()}
function chips(){
 const ix=CATS.map((c,i)=>i).filter(i=>cnt[i]>0),n=ix.reduce((a,i)=>a+cnt[i],0);
 $('chips').innerHTML=`<button class="chip ${cat<0?'on':''}" data-i="-1">${t('All')}<em>${n}</em></button>`+ix.map(i=>{const c=CATS[i];return `<button class="chip ${cat===i?'on':''}" style="--c:${c.c}" data-i="${i}">${esc(cnm(i))}<em>${cnt[i]}</em></button>`}).join('');
}
function updTxt(){if(!D)return;const u=D.set.upd;if(!u)return;let e=$('upd');if(!e){const w=document.querySelector('footer .wrap');if(!w)return;e=document.createElement('p');e.id='upd';e.className='note';w.appendChild(e)}e.textContent=t('Updated')+': '+u.slice(0,16).replace('T',' ')+' UTC'}
$('tabs').hidden=true;
$('chips').onclick=e=>{const b=e.target.closest('.chip');if(!b)return;cat=+b.dataset.i;chips();draw()};
function search(v){q=v.trim().toLowerCase();$('hq').value=v;if(q)cat=-1;chips();draw()}
$('hq').oninput=e=>search(e.target.value);
$('hq').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('shop').scrollIntoView({behavior:'smooth'})}};
$('g').addEventListener('click',e=>{const im=e.target.closest('.th img');if(!im)return;const o=document.createElement('div');o.id='lb';o.setAttribute('role','dialog');o.setAttribute('aria-label',im.alt);const i2=document.createElement('img');i2.src=im.src;i2.alt=im.alt;o.appendChild(i2);o.onclick=()=>o.remove();document.body.appendChild(o)});
const openCart=o=>{$('dr').classList.toggle('open',o);$('ov').classList.toggle('open',o)};
$('cb').onclick=()=>openCart(true);$('cx').onclick=$('ov').onclick=()=>openCart(false);
document.onkeydown=e=>{if(e.key==='Escape'){openCart(false);const l=$('lb');if(l)l.remove();const s=document.querySelector('.sheet');if(s)s.remove()}};

/* ===== Catalogue: shown from the phone's saved copy first, then refreshed from the server ===== */
async function refresh(){
 try{const r=await fetch('/api/catalog',{cache:'no-cache'});if(!r.ok)throw 0;const d=await r.json();load(d);try{localStorage.setItem('oxd',JSON.stringify(d))}catch(e){}return}catch(e){}
 if(!D){try{const r=await fetch('/catalog.json');load(await r.json())}catch(e){$('g').innerHTML='<p class="mu">'+t('No match. Message us on WhatsApp and we will check availability for you.')+'</p>'}}
}
try{const s=localStorage.getItem('oxd');if(s)load(JSON.parse(s))}catch(e){}
const hc=()=>{const m=location.hash.match(/^#c(\d+)$/);if(m){cat=+m[1];if(D){chips();draw()}setTimeout(()=>$('shop').scrollIntoView(),50)}};hc();addEventListener('hashchange',hc);
stat();refresh();
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});

/* ===== Install as an app ===== */
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
let deferred=null;
function sheet(title,lines){const o=document.createElement('div');o.className='sheet';o.innerHTML=`<div class="box" role="dialog" aria-label="${esc(t(title))}"><h3>${esc(t(title))}</h3>${lines.length>1?'<ol>'+lines.map(l=>'<li>'+esc(t(l))+'</li>').join('')+'</ol>':'<p style="margin:0">'+esc(t(lines[0]))+'</p>'}<button>${t('OK')}</button></div>`;o.onclick=e=>{if(e.target===o||e.target.tagName==='BUTTON')o.remove()};document.body.appendChild(o)}
const IOS_STEPS=['Tap the Share button at the bottom of Safari.','Choose Add to Home Screen, then Add.','Open Oxinab from your home screen.'];
if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}
/* Android: installing from an in-app browser (WhatsApp, Instagram...) or a non-Chrome browser makes an unsigned app that Play Protect blocks. Send those visitors to Chrome, which installs it cleanly. */
const UA=navigator.userAgent,isAndroid=/android/i.test(UA);
const notChrome=isAndroid&&(/; wv\)|FBAN|FBAV|Instagram|WhatsApp|Line\/|Snapchat|SamsungBrowser|MiuiBrowser|HeyTapBrowser|OPR\/|EdgA|Firefox/.test(UA)||!/Chrome\//.test(UA));
const openInChrome=()=>{location.href='intent://'+location.host+location.pathname+location.search+'#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url='+encodeURIComponent(location.href)+';end'};
if(!standalone()){
 if(isIOS||notChrome){$('inst').hidden=false}
 addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;$('inst').hidden=false});
}
addEventListener('appinstalled',()=>{$('inst').hidden=true;deferred=null});
$('inst').onclick=async()=>{if(notChrome&&!deferred){openInChrome()}else if(deferred){deferred.prompt();try{await deferred.userChoice}catch(e){}deferred=null;$('inst').hidden=true}else if(isIOS){sheet('Install Oxinab on your iPhone',IOS_STEPS)}};

/* ===== Offers by push notification ===== */
const pushOK='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const b64u=s=>{const p='='.repeat((4-s.length%4)%4),r=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(r,c=>c.charCodeAt(0))};
let PK=null;
async function ntfState(){
 const b=$('ntf');
 if(isIOS&&!standalone()&&!pushOK){b.hidden=false;return}
 if(!pushOK)return;
 let key=null;try{key=(await (await fetch('/api/push/key',{cache:'no-store'})).json()).key}catch(e){}
 PK=key;b.hidden=!key;if(!key)return;
 try{const reg=await navigator.serviceWorker.ready;const s=await reg.pushManager.getSubscription();$('ntft').textContent=t(s?'Offers are on':'Get offers on your phone');b.dataset.on=s?'1':''}catch(e){}
}
$('ntf').onclick=async()=>{
 if(!pushOK){if(isIOS)sheet('To get offers on iPhone, first add Oxinab to your home screen, then open it from there.',['To get offers on iPhone, first add Oxinab to your home screen, then open it from there.']);return}
 try{
  const reg=await navigator.serviceWorker.ready;
  const cur=await reg.pushManager.getSubscription();
  if(cur&&$('ntf').dataset.on){await fetch('/api/push/subscribe',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({subscription:cur})}).catch(()=>{});await cur.unsubscribe();toast(t('Offers turned off on this phone.'));return ntfState()}
  const perm=await Notification.requestPermission();
  if(perm!=='granted'){toast(t('Notifications are blocked. Allow them in your phone settings for this site.'));return}
  if(!PK)throw 0;
  const s=cur||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64u(PK)});
  const r=await fetch('/api/push/subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({subscription:s})});
  if(!r.ok)throw 0;
  toast(t('You will get Oxinab offers on this phone.'));ntfState();
 }catch(e){toast(t('Could not turn on offers. Please try again.'))}
};
ntfState();
