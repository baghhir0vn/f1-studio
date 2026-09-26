import { escapeHTML, money, normalizeText, showToast } from './ui.js';
import { CONFIG } from './config.js';
import { state as s, ctx } from './state.js';
const synonymMap = {
"lipa":[1,2], "nömrə":[1,2], "nomre":[1,2], "alışqan":[3], "alışqan yazı":[3], "domino":[4], "taxta":[4,5,6,12],
"lazer":[4,5,6,12], "masaüstü":[6], "masaustu":[6], "saat":[7,8], "qol saatı":[8], "qol saati":[8], "şəkil":[9], "sekil":[9], "3x4":[9],
"foto":[9], "banner":[10], "vinil":[10], "stiker":[11], "sticker":[11], "brelok":[11], "maket":[12]
};
const CHAT_MAX_LENGTH = 500;
function foldAz(text){
return String(text || '')
.toLocaleLowerCase('az-AZ')
.replace(/ə/g,'e').replace(/ı/g,'i').replace(/ş/g,'s').replace(/ç/g,'c').replace(/ğ/g,'g').replace(/ö/g,'o').replace(/ü/g,'u')
.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
.replace(/[^\p{L}\p{N}]+/gu,' ')
.trim();
}
function levenshtein(a,b){
a=String(a); b=String(b);
if(a===b) return 0;
if(!a.length) return b.length;
if(!b.length) return a.length;
if(a.length>b.length){ const t=a; a=b; b=t; }
let prev=Array.from({length:a.length+1},(_,i)=>i);
for(let j=1;j<=b.length;j++){
const cur=[j];
for(let i=1;i<=a.length;i++){
cur[i]=Math.min(cur[i-1]+1,prev[i]+1,prev[i-1]+(a[i-1]===b[j-1]?0:1));
}
prev=cur;
}
return prev[a.length];
}
function fuzzyWordMatch(queryWord,targetWord){
const q=foldAz(queryWord), t=foldAz(targetWord);
if(!q || !t) return false;
if(q===t) return true;
if((q.length>=4 && t.length>=4) && (q.includes(t) || t.includes(q))) return true;
if(Math.max(q.length,t.length) < 5) return false;
const maxDistance=Math.max(q.length,t.length)>=6 ? 2 : 1;
return levenshtein(q,t)<=maxDistance;
}
function fuzzyHasAny(q, words=[]){
const text=foldAz(q), tokens=text.split(/\s+/).filter(Boolean);
return words.some(word=>{
const target=foldAz(word);
if(!target) return false;
if(text.includes(target)) return true;
const targetTokens=target.split(/\s+/).filter(Boolean);
if(targetTokens.length===1) return tokens.some(token=>fuzzyWordMatch(token,targetTokens[0]));
return tokens.some((_,i)=>targetTokens.every((t,j)=>fuzzyWordMatch(tokens[i+j] || '',t)));
});
}
function phraseScore(query, phrase){
const q=foldAz(query), p=foldAz(phrase);
if(!q || !p) return 0;
if(q.includes(p)) return 40;
const tokens=q.split(/\s+/).filter(Boolean), target=p.split(/\s+/).filter(Boolean);
if(target.length===1) return tokens.some(t=>fuzzyWordMatch(t,target[0])) ? 22 : 0;
let hits=0;
target.forEach(t=>{ if(tokens.some(token=>fuzzyWordMatch(token,t))) hits++; });
return hits===target.length ? 28 : 0;
}
const POSITION_WORDS = {
"birinci": 0, "birincini": 0, "1-ci": 0, "1ci": 0,
"ikinci": 1, "ikincini": 1, "2-ci": 1, "2ci": 1,
"üçüncü": 2, "üçüncünü": 2, "3-cü": 2, "3cu": 2,
"dördüncü": 3, "dördüncünü": 3, "4-cü": 3, "4cu": 3
};
export function initChat() {
const chatAliasMap = {
sevgili:["sevgili","sevgilim","sevgilimə","sevgiliyə","sevgilime","sevgiliye","qız dostum","qiz dostum","oğlan dostum","oglan dostum"],
ana:["ana","anam","anama","ana üçün","ana ucun"],
ata:["ata","atam","atama","ata üçün","ata ucun"],
dost:["dost","dostum","dosta","həmkar","hemkar"],
uşaq:["uşaq","uşağa","usaq","usağa","uşaqlar"],
qadin:["qadın","qadin","qız üçün","qiz ucun"],
kisi:["kişi","kisi","oğlan üçün","oglan ucun","kişi üçün","kisi ucun"],
aile:["ailə","aile","ailəm","ailem"],
ad_gunu:["ad günü","ad gunu","adgünü","adgunu"],
xususi_gun:["xüsusi gün","xususi gun","ildönümü","ildonumu","nişan","nisan"]
};
const body = document.getElementById("chatBody");
const input = document.getElementById("chatInput");
const sendButton = document.querySelector('.chat-footer button[data-action="sendChatMsg"]');
const welcomeMarkup = body?.innerHTML || '';
let chatBusy = false;
let pendingTimer = null;
let chatAudioContext = null;
if (!s.chatMemory || typeof s.chatMemory !== 'object') s.chatMemory = {};
Object.assign(s.chatMemory, {
lastMentionedProducts: Array.isArray(s.chatMemory.lastMentionedProducts) ? s.chatMemory.lastMentionedProducts : [],
lastSelectedProduct: s.chatMemory.lastSelectedProduct || null,
lastFilters: s.chatMemory.lastFilters || null,
turns: Number(s.chatMemory.turns || 0),
lastIntent: s.chatMemory.lastIntent || '',
lastQuery: s.chatMemory.lastQuery || '',
tone: s.chatMemory.tone || 'neutral',
lastUserMessages: Array.isArray(s.chatMemory.lastUserMessages) ? s.chatMemory.lastUserMessages : [],
  dialogue: s.chatMemory.dialogue && typeof s.chatMemory.dialogue === 'object' ? s.chatMemory.dialogue : {asked:[],answered:[],goal:null},
pendingAction: s.chatMemory.pendingAction || null,
profile: s.chatMemory.profile && typeof s.chatMemory.profile === 'object' ? s.chatMemory.profile : {budget:null,tags:[],occasion:null,category:null,quantity:null,updatedAt:0}
});
if(!Array.isArray(s.chatMemory.profile.tags)) s.chatMemory.profile.tags=[];
if(!s.chatMemory.giftWizard || typeof s.chatMemory.giftWizard !== 'object') s.chatMemory.giftWizard = null;
if(!s.chatMemory.orderPrep || typeof s.chatMemory.orderPrep !== 'object') s.chatMemory.orderPrep = null;
function syncChatFullscreenButton(fullscreen){
const button=document.getElementById("chatFullscreenBtn");
const trigger=document.querySelector(".chat-trigger");
button?.setAttribute("aria-pressed",String(fullscreen));
button?.setAttribute("aria-label",fullscreen?"Kiçik pəncərəyə qayıt":"Tam ekrana keçir");
if(button) button.textContent=fullscreen?"⤢":"⛶";
if(trigger) trigger.hidden=fullscreen;
}
function toggleChat(){
const box=document.getElementById("chatBox"), btn=document.querySelector(".chat-trigger");
if(!box) return;
const open=box.classList.toggle("open");
if(!open) box.classList.remove("chat-fullscreen");
syncChatFullscreenButton(false);
box.setAttribute("aria-hidden",String(!open));
btn?.setAttribute("aria-expanded",String(open));
if(open) setTimeout(()=>document.getElementById("chatInput")?.focus(),0);
else btn?.focus();
}
function toggleChatFullscreen(){
const box=document.getElementById("chatBox");
if(!box) return;
if(!box.classList.contains("open")) toggleChat();
if(!box.classList.contains("open")) return;
syncChatFullscreenButton(box.classList.toggle("chat-fullscreen"));
}
function playChatTick(sender){
if(sender!=='user' && sender!=='bot') return;
const AudioContextClass=window.AudioContext||window.webkitAudioContext;
if(!AudioContextClass) return;
try{
if(!chatAudioContext || chatAudioContext.state==='closed') chatAudioContext=new AudioContextClass();
const audio=chatAudioContext;
const scheduleTick=()=>{
if(audio.state!=='running') return;
const oscillator=audio.createOscillator();
const gain=audio.createGain();
const now=audio.currentTime;
oscillator.type='triangle';
oscillator.frequency.setValueAtTime(sender==='user'?720:520,now);
oscillator.frequency.exponentialRampToValueAtTime(sender==='user'?460:360,now+0.045);
gain.gain.setValueAtTime(0.0001,now);
gain.gain.exponentialRampToValueAtTime(0.055,now+0.006);
gain.gain.exponentialRampToValueAtTime(0.0001,now+0.06);
oscillator.connect(gain);
gain.connect(audio.destination);
oscillator.start(now);
oscillator.stop(now+0.065);
oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
};
if(audio.state==='running') scheduleTick();
else if(audio.state!=='closed') void audio.resume().then(scheduleTick).catch(()=>{});
}catch(_){/* Audio is optional; unsupported or blocked playback must not break chat. */}
}
function setBusy(next){
chatBusy = Boolean(next);
if(input){ input.disabled=chatBusy; input.setAttribute("aria-busy",String(chatBusy)); }
if(sendButton){ sendButton.disabled=chatBusy; sendButton.setAttribute("aria-disabled",String(chatBusy)); }
}
function addQuickChips(container, chips=[]){
if(!chips.length) return;
const wrap=document.createElement('div');
wrap.className='chat-quick-chips chat-followups';
chips.slice(0,3).forEach(chip=>{
const b=document.createElement('button');
b.type='button'; b.className='chip'; b.textContent=chip.label;
b.dataset.action='sendQuickMsg'; b.dataset.actionArgs=JSON.stringify([chip.text]);
wrap.appendChild(b);
});
container.appendChild(wrap);
}
function appendMsg(text,sender,items=[],chips=[],comparison=[]){
if(!body) return;
playChatTick(sender);
const msg=document.createElement("div");
msg.className=`chat-msg ${sender}`;
msg.setAttribute('data-chat-message','true');
msg.textContent=String(text || '');
body.appendChild(msg);
items.slice(0,4).forEach((p,index)=>{
const card=document.createElement("div");
card.className="chat-product-card";
const media=document.createElement('div');
media.className='emoji';
media.textContent=p.emoji || '🎁';
card.appendChild(media);
const details=document.createElement("div");
details.className="details";
const name=document.createElement('b'); name.textContent=p.name;
const price=document.createElement('span'); price.textContent=money(p.price);
const meta=document.createElement('small'); meta.textContent=[p.customizable?'✨ Fərdi dizayn':'Standart',p.productionTime].filter(Boolean).join(' • ');
details.append(name,price,meta);
card.appendChild(details);
const actions=document.createElement('div');
actions.className='chat-product-actions';
const view=document.createElement('button');
view.type='button'; view.className='chat-card-secondary'; view.textContent='Baxış';
view.setAttribute('aria-label',`${p.name} detallarına bax`);
view.onclick=()=>{ s.chatMemory.lastSelectedProduct=p; ctx.openProductModal?.(p.id); };
actions.appendChild(view);
if(p.customizable){
const custom=document.createElement('button');
custom.type='button'; custom.className='chat-card-secondary'; custom.textContent='Fərdiləşdir';
custom.setAttribute('aria-label',`${p.name} üçün fərdiləşdirməni aç`);
custom.onclick=()=>{ s.chatMemory.lastSelectedProduct=p; ctx.openCustomization?.(p.id); };
actions.appendChild(custom);
}
const add=document.createElement("button");
add.type="button"; add.className='chat-card-primary'; add.textContent=p.customizable?'Fərdiləşdir +':'🛒 Səbətə at';
add.setAttribute('aria-label',`${p.name} ${p.customizable?'üçün fərdiləşdirməni aç':'səbətə əlavə et'}`);
add.onclick=()=>{
s.chatMemory.lastSelectedProduct=p;
p.customizable ? ctx.openCustomization?.(p.id) : ctx.add?.(p.id);
};
actions.appendChild(add);
card.appendChild(actions);
msg.appendChild(card);
if(index===0) s.chatMemory.lastSelectedProduct=p;
});
if(Array.isArray(comparison) && comparison.length >= 2){
const wrap=document.createElement('div');
wrap.className='chat-comparison';
const title=document.createElement('div');
title.className='chat-comparison-title';
title.textContent='Müqayisə';
wrap.appendChild(title);
const table=document.createElement('table');
table.className='chat-comparison-table';
table.setAttribute('aria-label','Məhsul müqayisəsi');
const rows=[
['Məhsul', ...comparison.slice(0,3).map(p=>p.name)],
['Qiymət', ...comparison.slice(0,3).map(p=>money(p.price))],
['Material', ...comparison.slice(0,3).map(p=>p.material || '—')],
['Ölçü', ...comparison.slice(0,3).map(p=>p.size || '—')],
['Hazırlanma', ...comparison.slice(0,3).map(p=>p.productionTime || '—')],
['Fərdi dizayn', ...comparison.slice(0,3).map(p=>p.customizable ? 'Bəli' : 'Xeyr')]
];
rows.forEach((cells,rowIndex)=>{
const tr=document.createElement('tr');
cells.forEach((cell,cellIndex)=>{
const el=document.createElement(rowIndex===0 ? (cellIndex===0?'th':'th') : (cellIndex===0?'th':'td'));
el.textContent=String(cell);
if(rowIndex===0 && cellIndex>0) el.scope='col';
if(cellIndex===0 && rowIndex>0) el.scope='row';
tr.appendChild(el);
});
table.appendChild(tr);
});
wrap.appendChild(table);
const actions=document.createElement('div');
actions.className='chat-compare-actions';
comparison.slice(0,3).forEach((p)=>{
const b=document.createElement('button');
b.type='button'; b.className='chat-card-secondary'; b.textContent=`${p.name} — bax`;
b.onclick=()=>{ s.chatMemory.lastSelectedProduct=p; ctx.openProductModal?.(p.id); };
actions.appendChild(b);
});
wrap.appendChild(actions);
msg.appendChild(wrap);
}
addQuickChips(msg,chips);
body.scrollTop=body.scrollHeight;
}
function clearChat(){
if(!body) return;
if(pendingTimer) { clearTimeout(pendingTimer); pendingTimer=null; }
setBusy(false);
body.innerHTML=welcomeMarkup;
s.chatMemory.lastMentionedProducts=[];
s.chatMemory.lastSelectedProduct=null;
s.chatMemory.lastFilters=null;
s.chatMemory.turns=0;
s.chatMemory.lastIntent='';
s.chatMemory.lastQuery='';
s.chatMemory.tone='neutral';
s.chatMemory.lastUserMessages=[];
s.chatMemory.dialogue={asked:[],answered:[],goal:null};
s.chatMemory.pendingAction=null;
s.chatMemory.profile={budget:null,tags:[],occasion:null,category:null,quantity:null,updatedAt:0};
s.chatMemory.giftWizard=null;
s.chatMemory.orderPrep=null;
input?.focus();
showToast('Söhbət təmizləndi.');
}
function sendQuickMsg(txt){
if(!input) return;
input.value=String(txt || '').slice(0,CHAT_MAX_LENGTH);
sendChatMsg();
}
function sendChatMsg(){
if(chatBusy || !input) return;
const text=input.value.trim().slice(0,CHAT_MAX_LENGTH);
if(!text) return;
appendMsg(text,"user");
input.value="";
setBusy(true);
const typingId="typing-"+Date.now();
const typ=document.createElement("div");
typ.id=typingId; typ.className="typing-indicator"; typ.setAttribute('role','status'); typ.setAttribute('aria-label','Asistent cavab hazırlayır');
typ.innerHTML='<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
body?.appendChild(typ);
if(body) body.scrollTop=body.scrollHeight;
pendingTimer=setTimeout(()=>{
pendingTimer=null;
document.getElementById(typingId)?.remove();
try{
const reply=ctx.processBotQuery(text) || {text:'Hazırda cavab verə bilmirəm.'};
appendMsg(reply.text,'bot',reply.items||[],reply.chips||[],reply.comparison||[]);
}catch(_){
appendMsg('Hazırda sorğunu emal edərkən problem yarandı. Zəhmət olmasa bir az sonra yenidən yoxla.','bot');
}finally{
setBusy(false);
input?.focus();
}
},420);
}
function inferChatTags(q){
const tags=new Set();
Object.entries(chatAliasMap).forEach(([tag,words])=>{
if(words.some(w=>phraseScore(q,w)>0)) tags.add(tag);
});
return [...tags];
}
const PROFILE_RECIPIENT_TAGS=['sevgili','ana','ata','dost','usaq','qadin','kisi','aile'];
function updateConversationProfile(q, {found=[]}={}){
const profile=s.chatMemory.profile || (s.chatMemory.profile={budget:null,tags:[],occasion:null,category:null,quantity:null,updatedAt:0});
const explicitBudget=ctx.extractBudget(q);
const explicitTags=ctx.inferChatTags(q);
const explicitOccasion=parseOccasion(q);
const explicitRecipient=explicitTags.find(t=>PROFILE_RECIPIENT_TAGS.includes(t));
if(explicitBudget) profile.budget=explicitBudget;
if(explicitRecipient){
profile.tags=[...(profile.tags||[]).filter(t=>!PROFILE_RECIPIENT_TAGS.includes(t)),explicitRecipient];
}else if(explicitTags.length){
profile.tags=[...new Set([...(profile.tags||[]),...explicitTags])].slice(-8);
}
if(explicitOccasion) profile.occasion=explicitOccasion;
const matched=found[0] || null;
if(matched?.cat) profile.category=matched.cat;
const quantity=ctx.extractQuantity?.(q);
if(quantity) profile.quantity=quantity;
profile.updatedAt=Date.now();
return {budget:profile.budget,tags:[...(profile.tags||[])],occasion:profile.occasion,category:profile.category,quantity:profile.quantity};
}
function profileHasSignal(q){
const l=foldAz(q);
const budgetSignal=ctx.extractBudget(q);
const tags=ctx.inferChatTags(q);
const occasion=parseOccasion(q);
const relationOnly=/^(?:sevgilim|anam|atam|dostum|qiz dostum|oglan dostum|anam ucun|atam ucun|sevgilim ucun|sevgili ucun|dostum ucun|qadin ucun|kisi ucun)$/i.test(l);
const explicitCatalog=/(?:ne var|goster|variant|mehsul|hediyye|almaq|gotur|sifaris|mene ne meslehet|hansini)/i.test(l);
return !explicitCatalog && (Boolean(budgetSignal)||tags.length>0||Boolean(occasion)||relationOnly);
}
function profileRecipient(profile){
return (profile?.tags||[]).find(t=>PROFILE_RECIPIENT_TAGS.includes(t)) || null;
}
function profileIsReady(profile){
return Boolean(profile?.budget && profileRecipient(profile));
}
function profileFollowupReply(profile){
const budgetText=profile.budget ? budgetLabel(profile.budget) : null;
const recipient=profileRecipient(profile);
const recipientText=recipient ? giftRecipientLabel(recipient) : null;
const occasion=profile.occasion ? occasionLabel(profile.occasion) : null;
if(!budgetText && !recipientText && !occasion) return null;
if(!budgetText) return `Başa düşdüm 👍 ${recipientText||'seçdiyin insan'} üçün seçim edəcəyəm. Büdcəni də yaz, uyğun variantları daraldım.`;
if(!recipientText) return `Başa düşdüm 👍 ${budgetText} büdcəni yadda saxladım. İndi kim üçün olduğunu de, daha dəqiq seçim edim.`;
const occasionText=occasion ? ` ${occasion} üçün` : '';
return `Başa düşdüm 👍 ${recipientText} üçün${occasionText}, ${budgetText} büdcəni yadda saxladım.`;
}
function extractBudget(q){
const l=normalizeText(q).replace(/,/g,".");
const budgetWord=l.match(/\b(?:budce[mmi]?|büdc(?:əm|em|e|ə))\b[^\d]{0,24}(\d+(?:\.\d+)?)/i) || l.match(/\b(\d+(?:\.\d+)?)\s*(?:azn|manat|₼)?\s*(?:budce|büdcə)\b/i);
if(budgetWord){
const n=Number(budgetWord[1]);
if(Number.isFinite(n)) return {min:0,max:n,exact:false};
}
const upper=l.match(/\b(\d+(?:\.\d+)?)\s*(?:azn|manat|₼)?\s*[-–]?\s*(?:den|dən)?\s*(?:cox|çox|yuxari|yuxarı|ustu|üstü|dan baslayan|dən başlayan)(?:\s|$)/i);
if(upper){
const n=Number(upper[1]);
if(Number.isFinite(n)) return {min:n,max:Infinity,exact:false};
}
const lower=l.match(/\b(?:minimum|en az|ən az)\s*(\d+(?:\.\d+)?)\s*(?:azn|manat|₼)?\b/i);
if(lower){
const n=Number(lower[1]);
if(Number.isFinite(n)) return {min:n,max:Infinity,exact:false};
}
const range=l.match(/\b(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(?:azn|manat|₼)?(?:\s*(?:arası|arasi|arasında|arasinda))?/i);
if(range){
const a=Number(range[1]), b=Number(range[2]);
return {min:Math.min(a,b),max:Math.max(a,b),exact:false};
}
const upTo=l.match(/\b(\d+(?:\.\d+)?)\s*(?:azn|manat|₼)?\s*(?:-ə|-a|-lik|-lıq|lik|liq|qədər|qeder|ə qədər|a qədər|manatlıq|manatliq|azn-lik|aznlik)\b/i);
if(upTo) return {min:0,max:Number(upTo[1]),exact:false};
const currency=l.match(/\b(\d+(?:\.\d+)?)\s*(?:azn|manat|₼)(?:lıq|liq|lıq)?\b/i);
if(currency) return {min:0,max:Number(currency[1]),exact:false};
return null;
}
function productMatches(q,{allowMeta=false}={}){
const l=foldAz(q), wantedTags=ctx.inferChatTags(q);
const metaIntent = !allowMeta && (wantsCompare(q) || wantsAlternative(q) || wantsPriceDirection(q,'low') || wantsPriceDirection(q,'high') || wantsGiftWizard(q));
if(metaIntent) return [];
return s.products.map(p=>{
let score=0;
const name=foldAz(p.name);
if(name && l.includes(name)) score+=48;
name.split(/\s+/).filter(Boolean).forEach(word=>{
if(word.length>=5 && fuzzyHasAny(q,[word])) score+=8;
});
Object.entries(synonymMap).forEach(([word,ids])=>{
if(ids.includes(p.id)){
const synonymFolded=foldAz(word);
if(synonymFolded && l.includes(synonymFolded)) score+=75;
else score+=phraseScore(q,word)*0.35;
}
});
p.tags?.forEach(t=>{ if(wantedTags.includes(t)) score+=8; });
if(p.cat && (l.includes(foldAz(p.cat)) || phraseScore(q,p.cat)>0)) score+=7;
return {p,score};
}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score || a.p.price-b.p.price).map(x=>x.p);
}
function wantsAddToCart(q, hasProduct=true){
if(!hasProduct) return false;
const l=foldAz(q);
return fuzzyHasAny(l,['səbətə at','səbətə əlavə et','əlavə et','satın al','sifariş ver']) || /\bgotur\b/i.test(l);
}
function wantsCustomize(q){
return fuzzyHasAny(q,['fərdiləşdir','dizayn et','yazı əlavə','üstünə yazı','xüsusi sifariş']);
}
function wantsDetails(q){
return fuzzyHasAny(q,['ətraflı','detal','məlumat','göstər','bax','şəkli']);
}
function wantsProductAttribute(q, attribute){
const l=foldAz(q);
if(attribute==='time' && /\b(nece gun|nece vaxta|ne qeder vaxta|ne qeder vaxt|hazir olur|hazirlanir|hazirlanma muddeti|muddet)\b/i.test(l)) return true;
if(attribute==='price' && /\b(qiymet|neceye|deyeri|ne qeder pul|ne qederdir)\b/i.test(l)) return true;
const groups={
material:['material','neden hazirlanib','neden hazirlanir'],
stock:['stok','stokda','movcuddur','qalmis'],
size:['olcu','boyu','razmer'],
customize:['ferdilestir','dizayn','yazi elave']
};
return fuzzyHasAny(l,groups[attribute]||[]);
}
function wantsCartSummary(q){
const l=foldAz(q);
return fuzzyHasAny(l,['sebetimde ne var','səbətimdə nə var','sebetde ne var','səbətdə nə var','sebeti goster','səbəti göstər','sebet ne qederdir','səbət nə qədərdir','sebetimdeki mehsullar']);
}
function wantsCartCount(q){
const l=foldAz(q);
return fuzzyHasAny(l,['sebetde nece eded var','sebetimde nece eded var','sebetde ne qeder mehsul var','sebetimde ne qeder mehsul var','sebetde nece mehsul var','sebetde ne qeder sey var']);
}
function wantsCartClear(q){
const l=foldAz(q);
return fuzzyHasAny(l,['sebeti temizle','sebeti bosalt','sebeti sifirla','butun sebeti sil','sebeti sil']);
}
function wantsOrderPrep(q){
const l=foldAz(q);
return fuzzyHasAny(l,[
'bunu sifarise hazirla','bunu sifarisə hazirla','bunu almaq isteyirem','bunu goturmek isteyirem',
'bunu sifaris vermek isteyirem','bunu sifaris etmek isteyirem','sifarise kec','sifarise basla',
'sifaris ucun hazirla','sifaris hazirla','sifarise hazirla','sifarişə hazırla','almaq isteyirem','bunu sifaris edek','sifarisi basladaq'
]);
}
function wantsOrderPrepCancel(q){
return fuzzyHasAny(q,['sifaris hazirligini dayandir','sifarisi dayandir','sifarisden imtina','sifarisden cix','sifarisi legv et']);
}
function orderPrepProduct(){
const id=s.chatMemory.orderPrep?.productId;
return id ? (ctx.getProduct?.(id) || s.products.find(p=>p.id===id) || null) : null;
}
function startOrderPrep(product, quantity=null){
if(!product) return {text:'Sifarişə hazırlamaq üçün əvvəlcə məhsul seçək.'};
const hasQuantity=Number.isInteger(Number(quantity)) && Number(quantity)>0;
const safeQty=hasQuantity ? Math.max(1,Math.min(50,Number(quantity))) : null;
s.chatMemory.orderPrep={productId:product.id,quantity:safeQty,step:hasQuantity?'customize':'quantity',customize:null,delivery:null};
s.chatMemory.lastSelectedProduct=product;
if(!hasQuantity) return {text:`🧾 ${product.name} üçün sifarişi hazırlayaq. Neçə ədəd istəyirsən?`,chips:[{label:'1 ədəd',text:'1 ədəd'},{label:'2 ədəd',text:'2 ədəd'},{label:'3 ədəd',text:'3 ədəd'}]};
if(product.customizable){
s.chatMemory.orderPrep.step='customize';
return {text:`🧾 ${product.name} üçün sifarişi hazırlayaq. ${safeQty} ədəd istəyirsən. Fərdiləşdirmək istəyirsən?`,chips:[{label:'✨ Bəli, fərdiləşdir',text:'bəli, fərdiləşdir'},{label:'➡️ Standart qalsın',text:'xeyr, standart olsun'},{label:'❌ Ləğv et',text:'sifariş hazırlığını dayandır'}]};
}
s.chatMemory.orderPrep.step='delivery';
return {text:`🧾 ${product.name} — ${safeQty} ədəd. Çatdırılma üsulunu seçək: mağazadan götürmə, yoxsa çatdırılma?`,chips:[{label:'🏪 Mağazadan götürəcəm',text:'mağazadan götürəcəyəm'},{label:'🚚 Çatdırılma',text:'çatdırılma istəyirəm'},{label:'❌ Ləğv et',text:'sifariş hazırlığını dayandır'}]};
}
function orderPrepCartLine(product){
return s.cart.find(i=>Number(i.id)===Number(product?.id) && (Number(i.qty)||0)>0) || null;
}
function validateOrderPrepCart(product, prep){
const line=orderPrepCartLine(product);
if(!line) return {ok:false,message:`🛒 ${product.name} hələ səbətə əlavə edilməyib. Fərdiləşdirməni tamamlayıb məhsulu səbətə əlavə et.`};
const cartQty=Number(line.qty)||0;
if(cartQty !== Number(prep.quantity)) return {ok:false,message:`📦 Sifarişdə ${prep.quantity} ədəd seçmisən, amma səbətdə ${cartQty} ədəd var. Checkout-a keçməzdən əvvəl miqdarı düzəlt.`};
if(product.customizable && prep.customize===true && !line.customization){
return {ok:false,message:`✨ Fərdiləşdirmə seçmisən, amma səbətdə dizayn məlumatı görünmür. Dizaynı tamamlayıb yenidən səbətə əlavə et.`};
}
return {ok:true,line};
}
function checkoutPreflight(){
const missing=[];
const name=document.getElementById('name')?.value?.trim()||'';
const phone=document.getElementById('phone')?.value?.trim()||'';
const delivery=document.getElementById('deliveryOption')?.value||'';
const unknown=!!document.getElementById('unknownAddress')?.checked;
const address=document.getElementById('address')?.value?.trim()||'';
if(!name) missing.push('ad və soyad');
if(!phone) missing.push('telefon');
if(!delivery) missing.push('çatdırılma üsulu');
if(delivery!=='pickup' && !unknown && !address) missing.push('ünvan və ya “telefonla dəqiqləşdirilsin” seçimi');
if(!String(CONFIG.whatsappNumber||'').replace(/\D/g,'')) missing.push('WhatsApp nömrəsi (sayt ayarlarında)');
return {ok:missing.length===0,missing};
}
function continueOrderPrep(q){
const prep=s.chatMemory.orderPrep;
if(!prep) return null;
if(wantsOrderPrepCancel(q)){ s.chatMemory.orderPrep=null; return {text:'✅ Sifariş hazırlığını dayandırdım. İstəsən başqa məhsul seçə bilərik.'}; }
const product=orderPrepProduct();
if(!product){ s.chatMemory.orderPrep=null; return null; }
const qty=extractQuantity(q);
const yes=wantsAffirmative(q) || fuzzyHasAny(q,['beli ferdilestir','ferdilestir','dizayn et','yazi elave et']);
const no=wantsNegative(q) || fuzzyHasAny(q,['standart olsun','ferdilestirme istemirem','dizayn istemirem']);
const folded=foldAz(q);
if(prep.step==='quantity') {
if(qty){ prep.quantity=qty; prep.step=product.customizable?'customize':'delivery'; }
else return {text:`📦 Neçə ədəd ${product.name} istəyirsən? Məsələn, “2 ədəd”.`,chips:[{label:'1 ədəd',text:'1 ədəd'},{label:'2 ədəd',text:'2 ədəd'},{label:'3 ədəd',text:'3 ədəd'}]};
}
if(prep.step==='customize'){
if(yes){
prep.customize=true; prep.step='customizing';
ctx.openCustomization?.(product.id);
return {text:`✨ ${product.name} üçün fərdiləşdirməni açdım. Yazı, şəkil, rəng və ölçünü seçib “Fərdiləşdir və səbətə əlavə et” düyməsinə bas. Sonra buraya “hazırdır” yaz, sifarişi tamamlayım.`};
}
if(no){ prep.customize=false; prep.step='delivery'; }
else return {text:`✨ Bu məhsulu fərdiləşdirmək istəyirsən?`,chips:[{label:'Bəli',text:'bəli, fərdiləşdir'},{label:'Xeyr',text:'xeyr, standart olsun'}]};
}
if(prep.step==='customizing'){
if(/(?:hazirdir|hazir oldu|sebete elave etdim|sebete elave edildi|bitirdim)/i.test(folded)){
const inCart=s.cart.some(i=>i.id===product.id && (Number(i.qty)||0)>0);
if(!inCart) return {text:`✨ ${product.name} üçün dizaynı tamamladıqdan sonra onu fərdiləşdirmə pəncərəsində səbətə əlavə et. Əlavə etdikdə buradan sifarişi davam etdirə bilərik.`};
prep.step='delivery';
} else {
return {text:`✨ Fərdiləşdirməni tamamlayanda “hazırdır” yaz. Mən də növbəti addıma keçirəm.`};
}
}
if(prep.step==='delivery'){
const pickup=/(?:magazadan gotur|magazadan goturecem|magazadan gotureceyem|pickup|götürəcəyəm)/i.test(folded);
const ganja=/(?:gence|gəncə)/i.test(folded) && /(?:catdirilma|kuryer|unvan|gonder)/i.test(folded);
const delivery=/(?:catdirilma|kuryer|unvana|unvanima|rayona|poctla)/i.test(folded);
if(pickup) prep.delivery='pickup';
else if(ganja) prep.delivery='ganja';
else if(delivery){
if(!/(?:gence|gəncə|rayon|poct|poçt)/i.test(folded)) return {text:`🚚 Çatdırılmanı hansı istiqamətə istəyirsən: Gəncə daxili, yoxsa rayonlara?`,chips:[{label:'📍 Gəncə',text:'Gəncə daxili çatdırılma'},{label:'📦 Rayon',text:'Rayonlara çatdırılma'}]};
prep.delivery=/(?:gence|gəncə)/i.test(folded) ? 'ganja' : 'delivery';
}
else if(!prep.delivery) return {text:`🚚 Son olaraq çatdırılma üsulunu seçək: mağazadan götürmə, yoxsa çatdırılma?`,chips:[{label:'🏪 Mağazadan götürmə',text:'mağazadan götürəcəyəm'},{label:'📍 Gəncə',text:'Gəncə daxili çatdırılma'},{label:'📦 Rayon',text:'Rayonlara çatdırılma'}]};
}
if(prep.delivery){
const validation=validateOrderPrepCart(product,prep);
const deliveryText=prep.delivery==='pickup'?'mağazadan götürmə':prep.delivery==='ganja'?'Gəncə daxili çatdırılma':'rayonlara çatdırılma';
const customText=product.customizable ? (prep.customize===false?'standart':'fərdiləşdirilmiş') : 'standart';
const extraNote=product.customizable && prep.customize===false ? '\n\nİstəsən fərdiləşdirməni sonradan da aça bilərik.' : '';
if(!validation.ok){
return {text:`🧾 Sifarişi hələ WhatsApp-a göndərməyə hazır deyiləm.\n• ${product.name}\n• ${prep.quantity} ədəd\n• ${customText}\n• ${deliveryText}\n\n${validation.message}`,chips:[{label:'🛒 Səbəti göstər',text:'səbətimdə nə var?'},{label:'🔄 Yenidən yoxla',text:'sifarişi yoxla'},{label:'❌ Ləğv et',text:'sifariş hazırlığını dayandır'}]};
}
const cartTotal=ctx.getEstimatedOrderTotal?.() ?? Number(product.price||0)*prep.quantity;
return {text:`🧾 Sifariş xülasəsi və ilkin yoxlama:\n• ${product.name}\n• ${prep.quantity} ədəd\n• ${customText}\n• ${deliveryText}\n• Səbətdəki təxmini cəm: ${money(cartTotal)}${extraNote}\n\n✅ Məhsul, miqdar və səbət məlumatı uyğun gəlir. İndi checkout məlumatlarını doldura bilərik.`,chips:[{label:'🧾 Checkout-u aç',text:'sifarişi tamamla'},{label:'🛍️ Səbəti göstər',text:'səbətimdə nə var?'},{label:'❌ Hazırlığı ləğv et',text:'sifariş hazırlığını dayandır'}]};
}
return null;
}
function wantsOrderHowTo(q){
const l=foldAz(q);
return fuzzyHasAny(l,['sifaris nece verim','sifariş necə verim','nece sifaris edim','necə sifariş edim','sifaris etmek isteyirem','sifariş etmək istəyirəm','checkout','sifarisi tamamla','sifarişi tamamla']);
}
function wantsCheckoutCommand(q){
const l=foldAz(q);
return fuzzyHasAny(l,['checkouta kec','checkout-a kec','checkoutu ac','checkout ac','sifarisi tamamla','sifarisi tamamlayim','sifarişi tamamla','whatsapp-a kec','whatsapp-a keç','whatsapp sifarisini hazirla']);
}
function openCheckoutFromOrderPrep(){
const prep=s.chatMemory.orderPrep;
const product=orderPrepProduct();
if(!prep || !product) return {text:'🧾 Aktiv sifariş hazırlığı tapılmadı. İstəsən səbətdəki məhsullardan birini seçək.'};
const validation=validateOrderPrepCart(product,prep);
if(!validation.ok) return {text:`⚠️ Checkout-a keçməzdən əvvəl bir məsələni düzəltmək lazımdır: ${validation.message}`,chips:[{label:'🛒 Səbəti göstər',text:'səbətimdə nə var?'},{label:'🔄 Yenidən yoxla',text:'sifarişi yoxla'}]};
const select=document.getElementById('deliveryOption');
if(select){
select.value=prep.delivery==='pickup'?'pickup':prep.delivery==='ganja'?'ganja':'region';
ctx.handleDeliveryChange?.();
}
ctx.openCart?.();
const preflight=checkoutPreflight();
if(!preflight.ok){
return {text:`🧾 Sifariş məhsul baxımından hazırdır. WhatsApp-a keçməzdən əvvəl bunları tamamla: ${preflight.missing.join(', ')}. Checkout pəncərəsini açdım; məlumatları doldur, sonra “WhatsApp ilə Sifariş Et” düyməsinə basa bilərsən.`,chips:[{label:'🛍️ Səbəti yoxla',text:'səbətimdə nə var?'},{label:'❌ Hazırlığı ləğv et',text:'sifariş hazırlığını dayandır'}]};
}
return {text:'✅ Sifariş məlumatları ilkin yoxlamadan keçdi. Checkout açıqdır. Son dəfə məlumatları yoxla və “WhatsApp ilə Sifariş Et” düyməsinə basa bilərsən.',chips:[{label:'🛍️ Səbəti göstər',text:'səbətimdə nə var?'},{label:'❌ Hazırlığı ləğv et',text:'sifariş hazırlığını dayandır'}]};
}
function wantsCustomOnly(q){
const l=foldAz(q);
return fuzzyHasAny(l,['ferdilestirilə bilen','fərdiləşdirilə bilən','ferdilesdirile bilen','ferdi mehsullar','fərdi məhsullar','ozel dizayn','özəl dizayn']);
}
function productStockLabel(p){
if(p?.stockQuantity!=null) return Number(p.stockQuantity)>0 ? `Stokda ${p.stockQuantity} ədəd var` : 'Hazırda stokda yoxdur';
return p?.stock || 'Stok məlumatı qeyd olunmayıb';
}
function describeReferencedProduct(p,attribute){
if(!p) return null;
if(attribute==='price') return `💰 ${p.name} — ${money(p.price)}.`;
if(attribute==='time') return `⏱️ ${p.name}: hazırlanma müddəti ${p.productionTime || 'qeyd olunmayıb'}.`;
if(attribute==='material') return `🧱 ${p.name}: materialı ${p.material || 'qeyd olunmayıb'}.`;
if(attribute==='stock') return `📦 ${p.name}: ${productStockLabel(p)}.`;
if(attribute==='size') return `📐 ${p.name}: ölçü ${p.size || 'qeyd olunmayıb'}.`;
if(attribute==='customize') return p.customizable ? `✨ ${p.name} fərdiləşdirilə bilir. Yazı, şəkil və digər dizayn detalları məhsul seçimindən sonra dəyişdirilə bilər.` : `ℹ️ ${p.name} hazırda standart məhsuldur və ayrıca fərdiləşdirmə açarı yoxdur.`;
return null;
}
function wantsAlternative(q){
const l=foldAz(q);
return /\b(?:basqa|diger|alternativ)\b/i.test(l) || /bu\s+mehsuldan\s+basqa/i.test(l);
}
function wantsPriceDirection(q, direction){
const l=foldAz(q);
if(direction==='low') return fuzzyHasAny(l,['daha ucuz','ən ucuz','ucuz']) || /azal[dt]|ucuzlas/.test(l);
return fuzzyHasAny(l,['daha bahalı','bahalı']) || /bahal[a-z]*$/.test(l);
}
function wantsExtremeFromResults(q, direction){
const l=foldAz(q);
const current=fuzzyHasAny(l,['bunlardan','bu variantlardan','bu mehsullardan','bu mehsullar arasinda','bu siyahidan','arasindan']);
if(!current) return false;
if(direction==='low') return fuzzyHasAny(l,['en ucuzu','en ucuz olan','ucuz olan hansidir','en ucuz hansidir']);
return fuzzyHasAny(l,['en bahalisi','en bahali olan','bahali olan hansidir','en bahali hansidir']);
}
function wantsRecommendation(q){
return fuzzyHasAny(q,[
'hansini məsləhət görərsən','hansini meslehet gorersen','hansı daha uyğundur','hansi daha uygundur',
'səncə hansını alım','sence hansini alim','mən hansını götürüm','men hansini goturum',
'ən uyğun hansıdır','en uygun hansidir','mənə ən uyğununu seç','mene en uygununu sec'
]);
}
function wantsCompanion(q){
return fuzzyHasAny(q,[
'bunun yanında nə','bunun yaninda ne','buna uyğun nə var','buna uygun ne var',
'üstünə nə götürüm','ustune ne goturum','bir yerdə nə yaxşı gedər','bir yerde ne yaxsi gider',
'yanında nə məsləhətdir','yaninda ne meslehetdir','buna nə əlavə edim','buna ne elave edim'
]);
}
function wantsResultsTotal(q){
return fuzzyHasAny(q,[
'bunların hamısı neçə edir','bunlarin hamisi nece edir','bunların cəmi nə qədərdir','bunlarin cemi ne qederdir',
'bu məhsulların cəmi','bu mehsullarin cemi','hamısını alsam neçəyə','hamisini alsam neceye',
'bunların ümumi qiyməti','bunlarin umumi qiymeti'
]);
}
function wantsPositionOnly(q){
const l=foldAz(q);
const hasPosition=Object.keys(POSITION_WORDS).some(word=>l===foldAz(word) || new RegExp(`\\b${foldAz(word)}\\b`,'i').test(l));
if(!hasPosition) return false;
if(Object.keys(POSITION_WORDS).some(word=>l===foldAz(word))) return true;
return fuzzyHasAny(l,['göstər','goster','bax','detal','aç','ac','seç','sec','hansı','hansi','al','götür','gotur','fərdiləşdir','ferdilestir']);
}
function extractQuantity(q){
const l=foldAz(q);
const m=l.match(/\b(\d{1,2})\s*(?:eded|dene|dene|dane)\b/i);
const n=m ? Number(m[1]) : null;
return Number.isInteger(n) && n>0 && n<=50 ? n : null;
}
function wantsAffirmative(q){
return /^(he|beli|olar|olur|tamam|ok|oke|hedir|davam et|davamedek|goster|goster onu|ac|ac onu)$/i.test(foldAz(q));
}
function wantsNegative(q){
return /^(yox|xeyr|xeyr sag ol|yox sag ol|istemirem|lazim deyil)$/i.test(foldAz(q));
}
function addStandardProductQuantity(product,quantity=1){
if(!product || quantity<1 || !ctx.ensureCatalogReady?.()) return {ok:false,message:'Məhsul hazır deyil.'};
if(product.customizable) return {ok:false,customizable:true};
const current=s.cart.filter(i=>i.id===product.id).reduce((sum,i)=>sum+(Number(i.qty)||0),0);
if(product.stockQuantity!=null){
const available=Math.max(0,Number(product.stockQuantity)-current);
if(Number(product.stockQuantity)<=0) return {ok:false,message:'Bu məhsul hazırda stokda yoxdur.'};
if(quantity>available) return {ok:false,message:`Bu məhsuldan hazırda ən çox ${available} ədəd əlavə etmək olar.`};
}
const item=s.cart.find(i=>i.id===product.id && !i.customization);
if(item) item.qty+=quantity;
else s.cart.push({id:product.id,qty:quantity,lineId:ctx.makeClientId?.(`line-${product.id}`)||`chat-line-${product.id}-${Date.now()}`,customization:null});
ctx.saveCart?.();
ctx.openCart?.();
return {ok:true};
}
function wantsProductionSummary(q){
return fuzzyHasAny(q,[
'bunlar nece gune hazir olar','bunlarin hazirlanmasi ne qeder ceker',
'en gec ne vaxt hazir olar','hamisi ne vaxta hazir olar','hamisi nece gune hazir olar'
]);
}
function parseProductionDays(value=''){
const v=foldAz(value);
const m=v.match(/(\d+)\s*[-–]\s*(\d+)\s*(?:is gunu|gun)/i);
if(m) return {min:Number(m[1]),max:Number(m[2])};
const one=v.match(/(\d+)\s*(?:is gunu|gun)/i);
if(one) return {min:Number(one[1]),max:Number(one[1])};
const minutes=v.match(/(\d+)\s*[-–]?\s*(\d*)\s*(?:deqiqe)/i);
if(minutes){ const a=Number(minutes[1]), b=minutes[2]?Number(minutes[2]):a; return {min:a/480,max:b/480}; }
return null;
}
function setPendingAction(type,product=null,meta={}){
s.chatMemory.pendingAction={type,productId:product?.id||null,...(meta&&typeof meta==='object'?meta:{})};
}
function clearPendingAction(){
s.chatMemory.pendingAction=null;
}
function executePendingAction(){
const pending=s.chatMemory.pendingAction;
if(!pending) return null;
const product=pending.productId ? (ctx.getProduct?.(pending.productId) || s.products.find(p=>p.id===pending.productId)) : (s.chatMemory.lastSelectedProduct || null);
if(pending.type==='show-product' && product){
clearPendingAction(); s.chatMemory.lastSelectedProduct=product; ctx.openProductModal?.(product.id);
return {text:`👀 ${product.name} üçün məhsul detallarını açdım.`,chips:[{label:'💰 Qiymət',text:'Bunun qiyməti nədir?'},{label:'✨ Fərdiləşdir',text:'Bunu fərdiləşdir'},{label:'🛒 Səbətə at',text:'Bunu səbətə at'}]};
}
if(pending.type==='customize' && product){
clearPendingAction(); s.chatMemory.lastSelectedProduct=product; ctx.openCustomization?.(product.id);
return {text:`✨ ${product.name} üçün fərdiləşdirmə pəncərəsini açdım.`};
}
if(pending.type==='add-to-cart' && product){
clearPendingAction(); s.chatMemory.lastSelectedProduct=product;
if(product.customizable){ ctx.openCustomization?.(product.id); return {text:`✨ ${product.name} fərdiləşdirilə bilir. Fərdiləşdirmə pəncərəsini açdım; məlumatları tamamlayıb səbətə əlavə edə bilərsiniz.`}; }
ctx.add?.(product.id); return {text:`✅ ${product.name} səbətə əlavə edildi.`};
}
if(pending.type==='compare' && s.chatMemory.lastMentionedProducts?.length>=2){
clearPendingAction();
const comparison=s.chatMemory.lastMentionedProducts.slice(0,3);
s.chatMemory.lastSelectedProduct=comparison[0];
return {text:'⚖️ Son göstərilən məhsulları müqayisə etdim.',comparison,chips:[{label:'👀 Birincini göstər',text:'Birincini göstər'},{label:'👀 İkincini göstər',text:'İkincini göstər'},{label:'✨ Birincini fərdiləşdir',text:'Birincini fərdiləşdir'}]};
}
if(pending.type==='clear-cart'){
if(!s.cart.length){ clearPendingAction(); return {text:'🛒 Səbət onsuz da boşdur.'}; }
ctx.clearCart?.();
if(s.cart.length){ s.cart=[]; ctx.saveCart?.(); }
clearPendingAction();
ctx.renderCart?.();
return {text:'✅ Səbət tamamilə təmizləndi.',chips:[{label:'🎁 Hədiyyə seç',text:'Mənə hədiyyə seç'},{label:'🛍️ Məhsullar',text:'Məhsulları göstər'}]};
}
return null;
}
function scoreRecommendedProducts(pool,{budget=null,tags=[],occasion=null}={}){
return pool.map(p=>{
let score=0;
if(tags.length) score+=tags.reduce((n,t)=>n+(p.tags?.includes(t)?18:0),0);
if(occasion && p.tags?.includes(occasion)) score+=14;
if(budget){
const n=Number(p.price||0);
const center=budget.max===Infinity ? Math.max(budget.min,n) : (budget.min+budget.max)/2;
const distance=Math.abs(n-center);
score += n>=budget.min && n<=budget.max ? 35 : -Math.min(25,distance/3);
}
if(p.customizable) score+=5;
if(Number(p.stockQuantity)===0) score-=30;
return {p,score};
}).sort((a,b)=>b.score-a.score || a.p.price-b.p.price).map(x=>x.p);
}
function getRecommendationProducts(q,found=[]){
const budget=s.chatMemory.lastFilters?.budget || s.chatMemory.profile?.budget || ctx.extractBudget(q);
const tags=s.chatMemory.lastFilters?.tags?.length ? s.chatMemory.lastFilters.tags : (s.chatMemory.profile?.tags?.length ? s.chatMemory.profile.tags : ctx.inferChatTags(q));
const occasion=s.chatMemory.profile?.occasion || parseOccasion(q);
let pool=found.length ? found : (s.chatMemory.lastMentionedProducts?.length ? s.chatMemory.lastMentionedProducts : s.products);
if(!found.length && profileIsReady(s.chatMemory.profile) && !s.chatMemory.lastMentionedProducts?.length){
pool=s.products.slice();
if(tags.length) pool=pool.filter(p=>tags.some(t=>p.tags?.includes(t)));
if(budget) pool=pool.filter(p=>p.price>=budget.min && p.price<=budget.max);
}else if(!found.length && !s.chatMemory.lastMentionedProducts?.length){
if(tags.length) pool=pool.filter(p=>tags.some(t=>p.tags?.includes(t)));
if(budget) pool=pool.filter(p=>p.price>=budget.min && p.price<=budget.max);
}
return scoreRecommendedProducts(pool,{budget,tags,occasion}).slice(0,3);
}
function getCompanionProducts(q,base=[]){
const selected=s.chatMemory.lastSelectedProduct || base[0] || null;
if(!selected) return [];
const selectedTags=new Set(selected.tags||[]);
let pool=s.products.filter(p=>p.id!==selected.id);
pool.sort((a,b)=>{
const aTag=[...(a.tags||[])].filter(t=>selectedTags.has(t)).length;
const bTag=[...(b.tags||[])].filter(t=>selectedTags.has(t)).length;
const aCat=a.cat===selected.cat ? 5 : 0, bCat=b.cat===selected.cat ? 5 : 0;
const aNear=Math.abs(Number(a.price||0)-Number(selected.price||0));
const bNear=Math.abs(Number(b.price||0)-Number(selected.price||0));
return (bTag+bCat)-(aTag+aCat) || aNear-bNear || a.price-b.price;
});
return pool.slice(0,3);
}
function wantsCancelWizard(q){
return fuzzyHasAny(q,['ləğv et','legv et','dayandır','dayandir','sıfırla','sifirla','imtina et','başqa şey','basqa sey']);
}
function budgetLabel(budget){
if(!budget) return '';
if(budget.max===Infinity) return `${budget.min} ₼-dən yuxarı`;
if(budget.min===0) return `${budget.max} ₼-ə qədər`;
if(budget.min===budget.max) return `${budget.min} ₼`;
return `${budget.min}–${budget.max} ₼`;
}
function getAlternativeProducts(q, baseResults=[], limit=4){
const mentioned=new Set((s.chatMemory.lastMentionedProducts||[]).map(p=>p?.id).filter(Boolean));
const selected=s.chatMemory.lastSelectedProduct;
const budget=s.chatMemory.lastFilters?.budget || s.chatMemory.profile?.budget || ctx.extractBudget(q);
const tags=s.chatMemory.lastFilters?.tags?.length ? s.chatMemory.lastFilters.tags : (s.chatMemory.profile?.tags?.length ? s.chatMemory.profile.tags : ctx.inferChatTags(q));
const category=selected?.cat || baseResults[0]?.cat || null;
let pool=s.products.filter(p=>!mentioned.has(p.id) && p.id!==selected?.id);
if(category) pool=pool.filter(p=>p.cat===category || !tags.length);
if(tags.length) pool.sort((a,b)=>{
const as=tags.filter(t=>a.tags?.includes(t)).length, bs=tags.filter(t=>b.tags?.includes(t)).length;
return bs-as || a.price-b.price;
});
if(budget) pool=pool.filter(p=>p.price>=budget.min && p.price<=budget.max);
if(!pool.length){
pool=s.products.filter(p=>!mentioned.has(p.id) && p.id!==selected?.id);
if(budget) pool=pool.filter(p=>p.price>=budget.min && p.price<=budget.max);
pool.sort((a,b)=>a.price-b.price);
}
return pool.slice(0,limit);
}
function getReferencedProduct(q, found=[]){
const l=normalizeText(q);
const indexed=Object.entries(POSITION_WORDS).find(([word])=>l.includes(normalizeText(word)));
const pool=found.length ? found : (s.chatMemory.lastMentionedProducts || []);
if(indexed){ return pool[indexed[1]] || null; }
if(/(?:bu|bunu|o məhsul|o mehsul|həmin|hemin)/i.test(l)) return s.chatMemory.lastSelectedProduct || pool[0] || null;
return found[0] || (pool.length===1 ? pool[0] : null);
}
function responseChips({hasResults=false, hasBudget=false, hasSelected=false}={}){
const chips=[];
if(hasResults){
chips.push({label:'💰 Daha ucuz',text:'Bunlardan daha ucuz variantlar göstər'});
chips.push({label:'✨ Fərdiləşdir',text:'Birincini fərdiləşdir'});
}
if(hasSelected) chips.push({label:'🛒 Səbətə at',text:'Bunu səbətə at'});
if(!hasResults) chips.push({label:'🎁 Hədiyyə seç',text:'30 AZN-ə sevgilim üçün nə var?'});
chips.push({label:'🚚 Çatdırılma',text:'Çatdırılma neçəyədir?'}, {label:'💳 Ödəniş',text:'Ödənişi necə edirəm?'});
return chips.slice(0,3);
}
function wantsCompare(q){
const l=normalizeText(q);
return /(?:müqayisə|muqayise|müqayisə et|muqayise et|fərqi nədir|ferqi nedir|ikisi arasında|ikisini qarşılaşdır|ikisini qarsilasdir|vs\.?|versus)/i.test(l);
}
function wantsGiftWizard(q){
const l=normalizeText(q);
return /(?:mənə .*?(?:hədiyyə|hediyye).*?(?:seç|sec)|hədiyyə seç|hediyye sec|seçim et|secim et|mənim üçün hədiyyə tap|menim ucun hediyye tap|hədiyyə məsləhət|hediyye meslehet|mənə seçim et|mene secim et)/i.test(l);
}
function parseOccasion(q){
const l=normalizeText(q);
if(/(?:ad günü|ad gunu|adgunu|adgünü|doğum günü|dogum gunu)/i.test(l)) return 'ad_gunu';
if(/(?:xüsusi gün|xususi gun|ildönümü|ildonumu|nişan|nisan|sevgililər günü|sevgililer gunu)/i.test(l)) return 'xususi_gun';
if(/(?:sadəcə hədiyyə|sadəcə hediyye|sade hədiyyə|sade hediyye|münasibətsiz|munasibetsiz|elə-belə|ele bele)/i.test(l)) return 'general';
return null;
}
function extractWizardRecipient(q){
const tags=ctx.inferChatTags(q);
const preferred=['sevgili','ana','ata','dost','qadin','kisi','usaq','aile'];
return preferred.find(t=>tags.includes(t)) || tags[0] || null;
}
function giftRecipientLabel(tag){
return ({sevgili:'sevgilin',ana:'anan',ata:'atan',dost:'dostun',qadin:'qadın üçün',kisi:'kişi üçün',usaq:'uşaq üçün',aile:'ailən'})[tag] || 'sevdiyin insan';
}
function occasionLabel(tag){
return ({ad_gunu:'ad günü',xususi_gun:'xüsusi gün',general:'sadəcə hədiyyə'})[tag] || 'xüsusi bir gün';
}
function giftRecommendations(wizard){
const budget=wizard?.budget || null;
const recipient=wizard?.recipient || null;
const occasion=wizard?.occasion || null;
const scored=s.products.map(p=>{
let score=0;
if(recipient && p.tags?.includes(recipient)) score+=35;
if(occasion && p.tags?.includes(occasion)) score+=18;
if(p.customizable) score+=4;
if(budget){
const n=Number(p.price||0);
if(n>=budget.min && n<=budget.max) score+=32;
else if(n<=budget.max) score+=16;
else score-=Math.min(20, Math.ceil((n-budget.max)/5));
score-=Math.min(10, Math.abs(((budget.max + budget.min)/2)-n)/12);
}
return {p,score};
}).sort((a,b)=>b.score-a.score || a.p.price-b.p.price);
const filtered=scored.filter(x=>x.score>0).slice(0,4).map(x=>x.p);
return filtered.length ? filtered : s.products.slice().sort((a,b)=>a.price-b.price).slice(0,4);
}
function startGiftWizard(q){
const wizard={step:'recipient',recipient:extractWizardRecipient(q),budget:ctx.extractBudget(q),occasion:parseOccasion(q)};
if(wizard.recipient && wizard.budget){
wizard.step=wizard.occasion ? 'done' : 'occasion';
}else if(wizard.recipient){
wizard.step='budget';
}
if(wizard.step==='done'){
s.chatMemory.giftWizard=null;
const items=giftRecommendations(wizard);
s.chatMemory.lastMentionedProducts=items;
s.chatMemory.lastSelectedProduct=items[0] || null;
return {text:`🎁 ${giftRecipientLabel(wizard.recipient)} üçün uyğun hədiyyə variantlarını seçdim:`,items,chips:[{label:'💰 Daha ucuz',text:'Bunlardan daha ucuz variantlar göstər'},{label:'⚖️ Müqayisə et',text:'İlk iki variantı müqayisə et'},{label:'✨ Birincini fərdiləşdir',text:'Birincini fərdiləşdir'}]};
}
s.chatMemory.giftWizard=wizard;
if(wizard.step==='budget') return {text:`Əla! ${giftRecipientLabel(wizard.recipient)} üçün seçim edirəm. Büdcən təxminən nə qədərdir?`,chips:[{label:'💸 0–20 ₼',text:'0–20 AZN'},{label:'💰 20–50 ₼',text:'20–50 AZN'},{label:'💎 50+ ₼',text:'50 AZN-dən çox'}]};
if(wizard.step==='occasion') return {text:`Büdcəni aldım. Hədiyyə hansı münasibət üçündür?`,chips:[{label:'🎂 Ad günü',text:'Ad günü üçün'},{label:'✨ Xüsusi gün',text:'Xüsusi gün üçün'},{label:'🎁 Sadəcə hədiyyə',text:'Sadəcə hədiyyədir'}]};
return {text:'Məmnuniyyətlə hədiyyə seçərəm. Əvvəlcə kim üçün olduğunu de.',chips:[{label:'❤️ Sevgilim üçün',text:'Sevgilim üçün'},{label:'👩 Ana üçün',text:'Anam üçün'},{label:'👨 Ata üçün',text:'Atam üçün'}]};
}
function continueGiftWizard(q){
const wizard=s.chatMemory.giftWizard;
if(!wizard) return null;
const recipient=extractWizardRecipient(q);
const budget=ctx.extractBudget(q);
const occasion=parseOccasion(q);
const folded=foldAz(q);
let recipientAnswered=false;
let budgetAnswered=false;
let occasionAnswered=false;
if(recipient && (wizard.step==='recipient' || /(?:üçün|ucun|ə üçün|e ucun)/i.test(folded))){ wizard.recipient=recipient; recipientAnswered=true; }
if(budget && (wizard.step==='budget' || /(?:büdc|budce|azn|manat|₼)/i.test(folded))){ wizard.budget=budget; budgetAnswered=true; }
if(occasion){ wizard.occasion=occasion; occasionAnswered=true; }
if(wizard.step==='recipient' && !wizard.recipient && !recipientAnswered) return null;
if(wizard.step==='budget' && !wizard.budget && !budgetAnswered && !recipientAnswered) return null;
if(wizard.step==='occasion' && !wizard.occasion && !occasionAnswered && !recipientAnswered && !budgetAnswered) return null;
if(wizard.recipient && !wizard.budget){
wizard.step='budget';
return {text:`Super, ${giftRecipientLabel(wizard.recipient)} üçün seçim edirəm. Büdcən nə qədərdir?`,chips:[{label:'💸 0–20 ₼',text:'0–20 AZN'},{label:'💰 20–50 ₼',text:'20–50 AZN'},{label:'💎 50+ ₼',text:'50 AZN-dən çox'}]};
}
if(wizard.budget && !wizard.occasion){
wizard.step='occasion';
return {text:`${budgetLabel(wizard.budget)} büdcəni nəzərə alacağam. Hədiyyə hansı münasibət üçündür?`,chips:[{label:'🎂 Ad günü',text:'Ad günü üçün'},{label:'✨ Xüsusi gün',text:'Xüsusi gün üçün'},{label:'🎁 Sadəcə hədiyyə',text:'Sadəcə hədiyyədir'}]};
}
if(wizard.recipient && wizard.budget && wizard.occasion){
s.chatMemory.giftWizard=null;
const items=giftRecommendations(wizard);
s.chatMemory.lastMentionedProducts=items;
s.chatMemory.lastSelectedProduct=items[0] || null;
return {text:`🎁 Hazırdır! ${giftRecipientLabel(wizard.recipient)} üçün ${budgetLabel(wizard.budget)} büdcədə, ${occasionLabel(wizard.occasion)} üçün uyğun variantları seçdim:`,items,chips:[{label:'⚖️ İlk ikisini müqayisə et',text:'İlk iki variantı müqayisə et'},{label:'✨ Birincini fərdiləşdir',text:'Birincini fərdiləşdir'},{label:'💸 Daha ucuz',text:'Bunlardan daha ucuz variantlar göstər'}]};
}
return null;
}
function extractComparisonProducts(q){
const normalized=foldAz(q)
.replace(/(?:muqayise(?: et)?|ferqi ne(?:dir)?|ikisini qarsilasdir|vs|versus)/g,' ')
.replace(/\s+/g,' ')
.trim();
const parts=normalized.split(/\s+(?:ile|və|ve|arasinda|arasında)\s+/).map(x=>x.trim()).filter(Boolean);
if(parts.length<2) return [];
const picked=[];
parts.slice(0,3).forEach(part=>{
const matches=ctx.productMatches(part,{allowMeta:true});
if(matches[0] && !picked.some(p=>p.id===matches[0].id)) picked.push(matches[0]);
});
return picked;
}
function compareProducts(q, found){
const explicitByPhrase=extractComparisonProducts(q);
if(explicitByPhrase.length>=2) return explicitByPhrase.slice(0,3);
const pool=found.length ? found : (s.chatMemory.lastMentionedProducts || []);
const refs=[];
Object.keys(POSITION_WORDS).forEach(()=>{});
const explicit=pool.filter(Boolean);
if(/(?:birinci.*ikinci|1-ci.*2-ci|1ci.*2ci|ilk iki|ilk 2)/i.test(normalizeText(q)) && pool.length>=2){
refs.push(pool[0],pool[1]);
} else if(explicit.length>=2){
refs.push(explicit[0],explicit[1]);
}
const unique=[];
refs.forEach(p=>{ if(p && !unique.some(x=>x.id===p.id)) unique.push(p); });
return unique.slice(0,3);
}
function wantsHelpOrUncertainty(q){
const l=foldAz(q);
return fuzzyHasAny(l,[
'ne alim','ne goturum','ne secim','ne secim', 'hansi daha yaxsidir','hansini alim',
'bilmirəm ne alim','bilmirom ne alim','hec bilmirəm','hec bilmirem','mene komek et',
'men ne secim','qerar vere bilmirem','bir sey meslehet gor','meslehet ver'
]);
}
function wantsObjection(q){
const l=foldAz(q);
if(fuzzyHasAny(l,['cox bahadir','bahadir','budcem catmir','bahali geldi','daha ucuz olsun','ucuz bir sey'])) return 'price';
if(fuzzyHasAny(l,['bilmirem bunu beyenər','beyener','emin deyiləm','emin deyilem','qerarsizam'])) return 'uncertain';
if(fuzzyHasAny(l,['gec hazir olur','tez lazimdir','telesirem','bu gun lazimdir'])) return 'time';
return null;
}
function wantsContextualFollowup(q){
const l=foldAz(q);
return fuzzyHasAny(l,['buna ne uygun','bunun yanina ne','bununla ne goturum','yaninda ne goturum','buna ne elave edim'])
|| /^(bes|bəs) (ne|nece|hansi|bunu)/i.test(l);
}
function conversationStateSummary(){
const p=s.chatMemory.profile||{};
const bits=[];
if(p.budget) bits.push(budgetLabel(p.budget));
const recipient=profileRecipient(p);
if(recipient) bits.push(giftRecipientLabel(recipient));
if(p.occasion) bits.push(occasionLabel(p.occasion));
const selected=s.chatMemory.lastSelectedProduct;
if(selected) bits.push(selected.name);
return bits;
}
function buildGuidedRecommendation(){
const p=s.chatMemory.profile||{};
const budget=p.budget||null, tags=p.tags||[], occasion=p.occasion||null;
const items=scoreRecommendedProducts(s.products.slice(),{budget,tags,occasion})
.filter(x=>!budget || (x.price>=budget.min && x.price<=budget.max))
.slice(0,4);
if(items.length){
s.chatMemory.lastMentionedProducts=items;
s.chatMemory.lastSelectedProduct=items[0]||null;
return {text:`Əla, seçimdə kömək edim 😊 ${conversationStateSummary().length?`Hazırda ${conversationStateSummary().join(', ')} məlumatını nəzərə alıram. `:''}Sənə uyğun variantları seçdim:`,items,chips:[{label:'👀 Birincini göstər',text:'Birincini göstər'},{label:'⚖️ İlk ikisini müqayisə et',text:'İlk iki variantı müqayisə et'},{label:'💸 Daha ucuz',text:'Bunlardan daha ucuz variantlar göstər'}]};
}
if(budget && tags.length) return {text:`Əlbəttə kömək edim 😊 ${budgetLabel(budget)} büdcədə ${giftRecipientLabel(profileRecipient(p))} üçün hazırda uyğun variant tapmadım. İstəsən büdcəni bir az genişləndirək və ya başqa məhsul tipinə baxaq.`,chips:[{label:'💰 Büdcəni dəyiş',text:'Büdcəmə uyğun başqa variant göstər'},{label:'🛍️ Bütün məhsullar',text:'Məhsulları göstər'}]};
if(budget) return {text:`Əlbəttə 😊 ${budgetLabel(budget)} büdcəni nəzərə alıram. Kim üçün olduğunu desən, seçimi daha dəqiq daraldaram.`,chips:[{label:'❤️ Sevgilim üçün',text:'Sevgilim üçündür'},{label:'👩 Ana üçün',text:'Anam üçündür'},{label:'👨 Ata üçün',text:'Atam üçündür'}]};
if(profileRecipient(p)) return {text:`Əlbəttə 😊 ${giftRecipientLabel(profileRecipient(p))} üçün seçim edək. Büdcəni desən, uyğun variantları çıxarım.`,chips:[{label:'💰 20 AZN',text:'Büdcəm 20 AZN-dir'},{label:'💰 30 AZN',text:'Büdcəm 30 AZN-dir'},{label:'💰 50 AZN',text:'Büdcəm 50 AZN-dir'}]};
return {text:'Əlbəttə, birlikdə seçək 😊 Mənə iki şeyi desən kifayətdir: kim üçündür və təxminən nə qədər büdcən var. Sonra uyğun variantları daraldaram.',chips:[{label:'🎁 Hədiyyə seç',text:'Mənə hədiyyə seç'},{label:'💰 30 AZN büdcə',text:'Büdcəm 30 AZN-dir'},{label:'🛍️ Məhsullara bax',text:'Məhsulları göstər'}]};
}
function objectionReply(type,q){
const p=s.chatMemory.profile||{};
if(type==='price'){
const budget=p.budget||null;
if(budget){
const items=getRecommendationProducts(q).filter(x=>x.price<=budget.max).slice(0,4);
if(items.length && (budget || tags.length || occasion)){
s.chatMemory.lastMentionedProducts=items;
s.chatMemory.lastSelectedProduct=items[0];
return {text:`Başa düşdüm 👍 Daha münasib variantlara keçək. ${budgetLabel(budget)} daxilində bunlara baxa bilərik:`,items,chips:[{label:'💸 Daha ucuz',text:'Bunlardan daha ucuz variantlar göstər'},{label:'⚖️ Müqayisə et',text:'İlk iki variantı müqayisə et'}]};
}
}
return {text:'Başa düşdüm 👍 Daha münasib variant tapaq. Təxminən maksimum neçə AZN olsun?',chips:[{label:'💰 20 AZN',text:'Maksimum 20 AZN'},{label:'💰 30 AZN',text:'Maksimum 30 AZN'},{label:'💰 50 AZN',text:'Maksimum 50 AZN'}]};
}
if(type==='time'){
const recent=(s.chatMemory.lastMentionedProducts||[]).filter(Boolean);
if(recent.length){
const parsed=recent.map(p=>parseProductionDays(p.productionTime||'')).filter(Boolean);
const min=parsed.length?Math.min(...parsed.map(x=>x.min)):null;
if(min!=null && min<=1) return {text:`Başa düşdüm, tez lazımdır ⏱️ Son baxdığımız məhsullar arasında ${min===0?'çox qısa müddətdə':'təxminən 1 iş günündə'} hazır olan variant var. İstəsən yalnız daha tez hazırlananları seçək.`,items:recent.filter(p=>{const d=parseProductionDays(p.productionTime||''); return d&&d.max<=1;}).slice(0,4),chips:[{label:'⚡ Tez hazırlananlar',text:'Tez hazırlanan məhsulları göstər'}]};
}
return {text:'Başa düşdüm, tez lazımdır ⏱️ İstəsən yalnız daha tez hazırlanan məhsulları seçək.',chips:[{label:'⚡ Tez hazırlananlar',text:'Tez hazırlanan məhsulları göstər'},{label:'🎁 Hədiyyə seç',text:'Mənə hədiyyə seç'}]};
}
return {text:'Başa düşdüm 😊 Tələsməyə ehtiyac yoxdur. İstəsən son göstərdiyim variantları müqayisə edək, ya da başqa variantlara baxaq.',chips:[{label:'⚖️ Müqayisə et',text:'İlk iki variantı müqayisə et'},{label:'🔁 Başqa variant',text:'Başqa variant göstər'}]};
}
function detectConversationTone(q){
const l=foldAz(q);
if(!l) return 'neutral';
if(fuzzyHasAny(l,['tez lazimdir','telesirem','bu gun lazimdir','indi lazimdir','acil','tecil','tez olsun'])) return 'urgent';
if(/[!]{2,}|[😊😂❤️😍🥹🙏👍]/u.test(String(q)) || fuzzyHasAny(l,['cox sag ol','tesekkur','super','ela','elaaa','mukemmel','😍','❤️'])) return 'friendly';
if(fuzzyHasAny(l,['zehmet olmasa','resmi','melumat verin','xahis edirem','mumkundurse'])) return 'formal';
if(fuzzyHasAny(l,['qisa de','qisa yaz','uzatma','birbasa de','birbasa'])) return 'terse';
return 'neutral';
}
function rememberUserTurn(q){
const tone=detectConversationTone(q);
if(tone!=='neutral') s.chatMemory.tone=tone;
const arr=Array.isArray(s.chatMemory.lastUserMessages)?s.chatMemory.lastUserMessages:[];
arr.push(String(q).slice(0,CHAT_MAX_LENGTH));
s.chatMemory.lastUserMessages=arr.slice(-6);
return tone;
}
function conversationGoal(q){
const l=foldAz(q);
if(wantsOrderPrep(q)) return 'order';
if(wantsGiftWizard(q) || /hediy|hədiyy|kim ucun|kim üçün/i.test(l)) return 'gift';
if(wantsRecommendation(q) || wantsHelpOrUncertainty(q)) return 'recommendation';
const cp=s.chatMemory.profile||{};
if((cp.budget && profileRecipient(cp)) && /(?:ne var|goster|variant|mehsul|hansi|nə var|göstər|məhsul|hansı)/i.test(l)) return 'recommendation';
if(wantsCompanion(q)) return 'companion';
if(wantsCompare(q)) return 'comparison';
if(s.chatMemory.lastSelectedProduct) return 'product';
return s.chatMemory.dialogue?.goal || null;
}
function rememberDialogue(q, reply){
const d=s.chatMemory.dialogue || (s.chatMemory.dialogue={asked:[],answered:[],goal:null});
const goal=conversationGoal(q);
if(goal) d.goal=goal;
const p=s.chatMemory.profile||{};
const answered=[];
if(p.budget) answered.push('budget');
if(profileRecipient(p)) answered.push('recipient');
if(p.occasion) answered.push('occasion');
if(p.quantity) answered.push('quantity');
d.answered=[...new Set([...(d.answered||[]),...answered])].slice(-10);
if(reply?.text && /\?|desən|desin|bildirin|seçək|seç/i.test(reply.text)){
let key='general';
if(/büdc|azn/i.test(reply.text)) key='budget';
else if(/kim üçündür|kim ucundur/i.test(reply.text)) key='recipient';
else if(/münasibət|münasibet|ad günü|xüsusi gün/i.test(reply.text)) key='occasion';
else if(/neçə ədəd|nece eded/i.test(reply.text)) key='quantity';
else if(/məhsul|model|variant/i.test(reply.text)) key='product';
d.asked=[...new Set([...(d.asked||[]),key])].slice(-10);
}
return d;
}
function proactiveNextStep(reply,q){
if(!reply || typeof reply!=='object') return reply;
const d=s.chatMemory.dialogue||{};
const p=s.chatMemory.profile||{};
const goal=d.goal;
const has=(k)=>Array.isArray(d.answered)&&d.answered.includes(k);
const addChip=(label,text)=>{
reply.chips=Array.isArray(reply.chips)?reply.chips:[];
if(reply.chips.some(c=>c.text===text)) return;
reply.chips=[...reply.chips.slice(0,2),{label,text}];
};
if(reply.items?.length){
if(goal==='gift' || goal==='recommendation'){
if(!has('occasion') && profileRecipient(p) && p.budget){
addChip('🎂 Ad günü', 'Ad günü üçün');
d.nextStep='occasion';
} else if(!has('budget') && profileRecipient(p)) {
addChip('💰 Büdcəmi deyim', 'Büdcəm 30 AZN-dir');
d.nextStep='budget';
} else {
addChip('⚖️ Müqayisə et','İlk iki variantı müqayisə et');
d.nextStep='compare';
}
} else if(goal==='product') {
addChip('🛒 Sifarişə hazırla','Birincini sifarişə hazırla');
d.nextStep='order';
}
return reply;
}
if(goal==='gift' || goal==='recommendation'){
if(!has('recipient') && !profileRecipient(p) && !d.asked?.includes('recipient')){
d.nextStep='recipient';
addChip('❤️ Sevgilim','Sevgilim üçündür');
addChip('👩 Ana','Anam üçündür');
} else if(goal==='gift' && !has('occasion') && !p.occasion && !d.asked?.includes('occasion')) {
d.nextStep='occasion';
addChip('🎂 Ad günü','Ad günü üçün');
addChip('✨ Xüsusi gün','Xüsusi gün üçün');
} else if(!has('budget') && !p.budget && !d.asked?.includes('budget')) {
d.nextStep='budget';
addChip('💰 30 AZN','Büdcəm 30 AZN-dir');
addChip('💰 50 AZN','Büdcəm 50 AZN-dir');
}
}
return reply;
}
function adaptConversationResponse(reply, q){
if(!reply || typeof reply!=='object' || !reply.text) return reply;
const tone=s.chatMemory.tone || detectConversationTone(q);
let text=String(reply.text);
text=text.replace(/^(?:Başa düşdüm 👍\s*){2,}/,'Başa düşdüm 👍 ');
if(tone==='terse'){
  text=text.replace(/Məmnuniyyətlə\s*/g,'').replace(/Əlbəttə\s*/g,'').replace(/Əla!\s*/g,'');
  text=text.replace(/\s+İstəsən[^.?!]*[.?!]/g,'.');
}
if(tone==='urgent'){
  if(!/tez|təcili|iş günü|hazır/i.test(text)) text=`⏱️ ${text}`;
  if(!reply.chips?.some(c=>/tez/i.test(c.label||'')) && !/tez|təcili/i.test(text)){
    reply.chips=[...(reply.chips||[]),{label:'⚡ Tez hazırlananlar',text:'Tez hazırlanan məhsulları göstər'}].slice(0,3);
  }
}
if(tone==='friendly' && !/[😊❤️👍✨🎁]/u.test(text)) text=`😊 ${text}`;
if(tone==='formal'){
  text=text.replace(/istəyirsən/g,'istəyirsiniz').replace(/de,/g,'bildirin,').replace(/de\./g,'bildirin.').replace(/götürək/g,'götürək');
  if(!/(verin|bildirin|edə bilərsiniz|istəyirsiniz|sizin)/i.test(text)) text += ' Zəhmət olmasa, əlavə məlumat lazım olsa bildirin.';
}
reply.text=text;
return reply;
}
function processBotQueryCore(q){
const l=normalizeText(q).slice(0,CHAT_MAX_LENGTH);
if(!l) return {text:'Mesajınızı yazın, kömək edim.'};
s.chatMemory.turns=(Number(s.chatMemory.turns)||0)+1;
if(wantsNegative(q) && s.chatMemory.pendingAction){
clearPendingAction();
return {text:'Oldu 👍 Başqa variant seçə bilərik.',chips:[{label:'🎁 Hədiyyə seç',text:'Mənə hədiyyə seç'},{label:'🛍️ Məhsullar',text:'Məhsulları göstər'}]};
}
if(wantsAffirmative(q) && s.chatMemory.pendingAction){
const pendingReply=executePendingAction();
if(pendingReply) return pendingReply;
}
if(s.chatMemory.giftWizard && wantsCancelWizard(q)){
s.chatMemory.giftWizard=null;
return {text:'✅ Hədiyyə seçimini sıfırladım. İstəsən yenidən başlaya bilərik.',chips:[{label:'🎁 Hədiyyə seç',text:'Mənə hədiyyə seç'},{label:'🛍️ Məhsullar',text:'Məhsulları göstər'}]};
}
const profileSignal=profileHasSignal(q);
const inGiftWizard=continueGiftWizard(q);
if(inGiftWizard) return inGiftWizard;
if(wantsGiftWizard(q)) return startGiftWizard(q);
if(s.chatMemory.orderPrep){
if(wantsCheckoutCommand(q)) return openCheckoutFromOrderPrep();
const prepReply=continueOrderPrep(q);
if(prepReply) return prepReply;
}
const objection=wantsObjection(q);
if(objection) return objectionReply(objection,q);
if(wantsContextualFollowup(q) && s.chatMemory.lastSelectedProduct){
const companions=getCompanionProducts(q,[s.chatMemory.lastSelectedProduct]);
if(companions.length){
s.chatMemory.lastMentionedProducts=companions;
s.chatMemory.lastSelectedProduct=companions[0];
return {text:`Əlbəttə 😊 ${s.chatMemory.lastSelectedProduct?.name||'bu məhsul'} ilə uyğun gedən variantları seçdim:`,items:companions,chips:[{label:'⚖️ Müqayisə et',text:'İlk iki variantı müqayisə et'},{label:'💸 Daha ucuz',text:'Bunlardan daha ucuz variantlar göstər'}]};
}
}
if(wantsHelpOrUncertainty(q) && !wantsRecommendation(q)) return buildGuidedRecommendation();
const preliminaryFound=ctx.productMatches(q);
const profile=updateConversationProfile(q,{found:preliminaryFound});
if(profileSignal && !wantsAlternative(q) && !wantsCompare(q) && !wantsRecommendation(q) && !wantsCompanion(q) && !wantsAddToCart(q,false)){
if(profileIsReady(profile)){
const profileItems=scoreRecommendedProducts(s.products.slice(),{budget:profile.budget,tags:profile.tags,occasion:profile.occasion})
.filter(p=>p.price>=profile.budget.min && p.price<=profile.budget.max)
.slice(0,4);
if(profileItems.length){
s.chatMemory.lastMentionedProducts=profileItems;
s.chatMemory.lastSelectedProduct=profileItems[0]||null;
s.chatMemory.lastFilters={budget:profile.budget,tags:profile.tags,query:l};
s.chatMemory.lastIntent='profile-recommendation';
return {text:`🎯 Sənin dediyin məlumatları birləşdirdim: ${giftRecipientLabel(profileRecipient(profile))} üçün, ${budgetLabel(profile.budget)}${profile.occasion?`, ${occasionLabel(profile.occasion)} üçün`:''}. Uyğun variantlar:`,items:profileItems,chips:[{label:'⚖️ İlk ikisini müqayisə et',text:'İlk iki variantı müqayisə et'},{label:'💸 Daha ucuz',text:'Bunlardan daha ucuz variantlar göstər'},{label:'✨ Birincini fərdiləşdir',text:'Birincini fərdiləşdir'}]};
}
}
const profileReply=profileFollowupReply(profile);
if(profileReply){
s.chatMemory.lastIntent='profile-update';
return {text:profileReply,chips:profile.budget && profileRecipient(profile) ? [{label:'🎁 Variantları göstər',text:'Mənə uyğun variantları göstər'},{label:'💸 Daha ucuz',text:'Büdcəmə uyğun daha ucuz variant göstər'},{label:'✨ Fərdi məhsullar',text:'Fərdiləşdirilə bilən məhsulları göstər'}] : [{label:'🎁 Hədiyyə seç',text:'Mənə hədiyyə seç'},{label:'🛍️ Məhsullar',text:'Məhsulları göstər'}]};
}
}
if(/^(salam|salamlar|hi|hello|sabahın xeyir|sabahiniz xeyir|axşamın xeyir|axsamınız xeyir|necəsiz|necəsen)/i.test(l)){
return {text:'Salam! 👋 Mən F1 Studio-nun sayt assistentiyəm. Hədiyyə seçimi, büdcə, məhsul detalları, dizayn, çatdırılma və sifariş prosesi ilə kömək edə bilərəm.',chips:[{label:'🎁 Hədiyyə seç',text:'30 AZN-ə sevgilim üçün nə var?'},{label:'🎨 Fərdi dizayn',text:'Fərdi dizayn necə edilir?'},{label:'🚚 Çatdırılma',text:'Çatdırılma neçəyədir?'}]};
}
if(/sağ ol|sag ol|çox sağ ol|cox sag ol|təşəkkür|tesekkur|sağol|sagol/i.test(l)) return {text:'Buyurun! 😊 Nə vaxt lazım olsa buradayam.',chips:[{label:'🎁 Hədiyyə seç',text:'Mənə hədiyyə seç'},{label:'🛍️ Məhsullar',text:'Məhsulları göstər'}]};
if(/hələlik|helelik|görüşərik|gorusərik|gorusarik/i.test(l)) return {text:'Hələlik! 👋 Gözəl gün arzulayıram.'};
if(/(?:ödəniş|odenis|kart|onlayn ödəniş|online odenis)/i.test(l)){
return {text:'💳 Hazırda saytda onlayn kart ödənişi yoxdur. Sifarişi checkout-dan keçib WhatsApp üzərindən tamamlayırıq. Admin sizinlə ödəniş və sifariş detalları barədə əlaqə saxlayır.',chips:[{label:'🛒 Checkout',text:'Sifarişi necə tamamlayım?'},{label:'🚚 Çatdırılma',text:'Çatdırılma neçəyədir?'},{label:'📍 Ünvan',text:'Ünvan və iş saatlarınız?'}]};
}
if(/çatdırılma|catdirilma|kuryer|poçt|göndəriş|gonderis|rayon/i.test(l)){
return {text:`🚚 Çatdırılma: mağazadan götürmə ${CONFIG.delivery.pickup===0?'pulsuzdur':money(CONFIG.delivery.pickup)}; Gəncə daxili ${money(CONFIG.delivery.ganja)}, bölgələrə poçt ${money(CONFIG.delivery.region)}.`};
}
if(/ünvan|harda|harada|iş saat|is saat|necə işləyir|nece isleyir|maqazin|mağaza|filial/i.test(l)){
const address=document.getElementById("siteAddressText")?.textContent?.trim()||"Ünvan ayarlarda qeyd olunmayıb.";
const weekday=document.getElementById("siteWeekdayHoursText")?.textContent?.replace(/^I - V günlər:\s*/,'')||'';
const weekend=document.getElementById("siteWeekendHoursText")?.textContent?.replace(/^VI - VII günlər:\s*/,'')||'';
return {text:`📍 ${address}\nİş saatları: I–V ${weekday}; VI–VII ${weekend}.`};
}
if(/(?:sifarişim|sifarisim|sifarişimi|sifarisimi).*(?:harada|izl|status|vəziyyət|veziyyet)/i.test(l)){
return {text:'🧾 Sifariş statusunu müştəri kabinetində Sifarişlərim bölməsindən görə bilərsiniz. Hesabınız yoxdursa, adminlə WhatsApp üzərindən dəqiqləşdirmək mümkündür.',chips:[{label:'👤 Kabinet',text:'Müştəri kabinetinə necə daxil olum?'},{label:'💬 WhatsApp',text:'WhatsApp ilə necə əlaqə saxlayım?'}]};
}
if(/(?:müştəri kabinet|musteri kabinet|hesab|login|giriş|giris|qeydiyyat)/i.test(l)){
return {text:'👤 Müştəri kabinetində qeydiyyatdan keçib giriş etdikdən sonra sifariş tarixçəsini görə, statusları izləyə və öz dizayn fayllarınıza baxa bilərsiniz.'};
}
if(/(?:whatsapp|what.?sapp|əlaqə|elaqe|operator|adminlə|adminle)/i.test(l)){
return {text:'💬 Sifariş və ödəniş məlumatlarını WhatsApp üzərindən adminlə tamamlayırıq. Checkout-u doldurduqdan sonra WhatsApp axını açılır.'};
}
if(wantsCartClear(q)){
if(!s.cart.length) return {text:'🛒 Səbət onsuz da boşdur.'};
setPendingAction('clear-cart');
return {text:'⚠️ Səbətdəki bütün məhsulları silmək istəyirsən? Bu əməliyyat səbətdəki seçimləri təmizləyəcək. Təsdiqləmək üçün “hə”, ləğv etmək üçün “yox” yaz.',chips:[{label:'✅ Bəli, təmizlə',text:'hə'},{label:'↩️ Ləğv et',text:'yox'}]};
}
if(wantsCartCount(q)){
const totalQty=s.cart.reduce((sum,i)=>sum+Math.max(0,Number(i.qty)||0),0);
const lines=s.cart.filter(i=>(Number(i.qty)||0)>0).length;
return {text:totalQty?`🛒 Səbətində ${totalQty} ədəd məhsul var (${lines} məhsul sətrində).`:'🛒 Səbətin hazırda boşdur.',chips:totalQty?[{label:'🧾 Sifarişi tamamla',text:'Sifarişi necə verim?'},{label:'🛍️ Səbəti göstər',text:'Səbətimdə nə var?'},{label:'🧹 Səbəti təmizlə',text:'Səbəti təmizlə'}]:[{label:'🎁 Hədiyyə seç',text:'Mənə hədiyyə seç'},{label:'🛍️ Məhsullar',text:'Məhsulları göstər'}]};
}
if(wantsCartSummary(q)){
const lines=s.cart.filter(i=>(Number(i.qty)||0)>0).map(i=>{
const p=ctx.getProduct?.(i.id);
return p ? `${p.name} × ${Number(i.qty)||1}` : null;
}).filter(Boolean);
if(!lines.length) return {text:'🛒 Səbətiniz hazırda boşdur.',chips:[{label:'🛍️ Məhsullara bax',text:'Məhsulları göstər'},{label:'🎁 Hədiyyə seç',text:'Mənə hədiyyə seç'}]};
const total=typeof ctx.getEstimatedOrderTotal==='function' ? ctx.getEstimatedOrderTotal() : s.cart.reduce((sum,i)=>sum+(ctx.getProduct?.(i.id)?.price||0)*(Number(i.qty)||0),0);
return {text:`🛒 Səbətinizdə ${lines.length} məhsul xətti var:
${lines.join('\n')}\n💰 Təxmini cəm: ${money(total)}.`,chips:[{label:'🧾 Sifarişi tamamla',text:'Sifarişi necə verim?'},{label:'🛍️ Səbəti aç',text:'Sifarişi necə verim?'}]};
}
if(wantsOrderHowTo(q)){
ctx.openCart?.();
return {text:'🧾 Sifariş üçün məhsulu səbətə əlavə edin, səbətdə çatdırılma və əlaqə məlumatlarını doldurun, sonra “WhatsApp ilə Sifariş Et” düyməsi ilə sifarişi tamamlayın. Onlayn kart ödənişi yoxdur.'};
}
const budget=s.chatMemory.profile?.budget || ctx.extractBudget(q);
const tags=s.chatMemory.profile?.tags?.length ? s.chatMemory.profile.tags : ctx.inferChatTags(q);
const found=preliminaryFound;
if(wantsProductionSummary(q) && s.chatMemory.lastMentionedProducts?.length){
const pool=s.chatMemory.lastMentionedProducts.filter(Boolean);
const ranges=pool.map(p=>parseProductionDays(p.productionTime)).filter(Boolean);
if(ranges.length){
const max=Math.max(...ranges.map(r=>r.max));
return {text:`⏱️ Son göstərilən məhsulların hamısının hazır olması üçün ən gec təxminən ${max} iş günü hesablayın. Dəqiq müddət hər məhsulun kartında göstərilir.`,items:pool};
}
return {text:'⏱️ Hazırlanma müddəti sifarişdən asılı olaraq dəyişə bilər. Dəqiq müddət məhsul kartında göstərilir.'};
}
if(wantsResultsTotal(q) && s.chatMemory.lastMentionedProducts?.length){
const pool=s.chatMemory.lastMentionedProducts.filter(Boolean);
const unique=[];
pool.forEach(p=>{ if(p && !unique.some(x=>x.id===p.id)) unique.push(p); });
const total=unique.reduce((sum,p)=>sum+Number(p.price||0),0);
return {text:`🧮 Hazırda göstərilən ${unique.length} məhsulun birlikdə qiyməti: ${money(total)}. Bu, hər məhsuldan 1 ədəd üçün hesablanıb.`,items:unique,chips:[{label:'⚖️ Müqayisə et',text:'İlk iki variantı müqayisə et'},{label:'💸 Daha ucuz',text:'Bunlardan daha ucuz variantlar göstər'},{label:'🛒 Birincini seç',text:'Birincini səbətə at'}]};
}
if(wantsCompanion(q)){
const anchor=s.chatMemory.lastSelectedProduct || found[0] || null;
const companions=getCompanionProducts(q,found);
if(companions.length){
s.chatMemory.lastMentionedProducts=companions;
s.chatMemory.lastSelectedProduct=companions[0] || null;
return {text:`🎁 ${anchor?.name || 'Bu məhsul'} yanında uyğun gedə biləcək variantları seçdim:`,items:companions,chips:[{label:'⚖️ Bu üçünü müqayisə et',text:'İlk iki variantı müqayisə et'},{label:'💸 Daha ucuz',text:'Bunlardan daha ucuz variantlar göstər'},{label:'✨ Birincini fərdiləşdir',text:'Birincini fərdiləşdir'}]};
}
return {text:'Bu məhsul üçün əlavə uyğun variant tapmadım. Başqa model və ya büdcə ilə baxa bilərik.',chips:responseChips({hasResults:Boolean(found.length)})};
}
if(wantsRecommendation(q)){
const recommendations=getRecommendationProducts(q,found);
if(recommendations.length){
s.chatMemory.lastMentionedProducts=recommendations;
s.chatMemory.lastSelectedProduct=recommendations[0];
const budgetHint=budget ? ` ${budgetLabel(budget)} büdcə` : '';
setPendingAction('show-product',recommendations[0]);
return {text:`✨${budgetHint} üçün uyğunluğa görə seçimlər hazırladım. Birincini açmağımı istəyirsənsə, “hə” də deyə bilərsən.`,items:recommendations,chips:[{label:'👀 Birincini göstər',text:'Birincini göstər'},{label:'⚖️ İlk ikisini müqayisə et',text:'İlk iki variantı müqayisə et'},{label:'💸 Daha ucuz',text:'Bunlardan daha ucuz variantlar göstər'}]};
}
}
if(wantsCompare(q)) {
const compareFound=ctx.productMatches(q,{allowMeta:true});
const comparison=compareProducts(q,compareFound);
if(comparison.length>=2){
s.chatMemory.lastMentionedProducts=comparison;
s.chatMemory.lastSelectedProduct=comparison[0];
return {text:`⚖️ İki məhsulu əsas xüsusiyyətlərinə görə müqayisə etdim.`,comparison,chips:[{label:'👀 Birincini göstər',text:'Birincini göstər'},{label:'👀 İkincini göstər',text:'İkincini göstər'},{label:'✨ Birincini fərdiləşdir',text:'Birincini fərdiləşdir'}]};
}
return {text:'Müqayisə etmək üçün ən azı iki məhsul seçməliyik. Məsələn: “Lipa ilə alışqanı müqayisə et” və ya “İlk iki variantı müqayisə et”.',chips:[{label:'🎁 Hədiyyə seç',text:'Mənə hədiyyə seç'},{label:'🛍️ Məhsullar',text:'Məhsulları göstər'}]};
}
if(wantsCustomOnly(q)){
const custom=s.products.filter(p=>p.customizable).slice().sort((a,b)=>a.price-b.price).slice(0,4);
s.chatMemory.lastMentionedProducts=custom;
s.chatMemory.lastSelectedProduct=custom[0] || null;
return {text:custom.length?'✨ Fərdiləşdirilə bilən məhsullar:':'Hazırda fərdiləşdirilə bilən məhsul tapılmadı.',items:custom,chips:custom.length?[{label:'✨ Birincini fərdiləşdir',text:'Birincini fərdiləşdir'},{label:'⚖️ İlk ikisini müqayisə et',text:'İlk iki variantı müqayisə et'},{label:'💰 Daha ucuz',text:'Bunlardan daha ucuz variantlar göstər'}]:responseChips()};
}
const referenced=getReferencedProduct(q,found);
if(referenced && wantsOrderPrep(q)){
const requestedQty=ctx.extractQuantity(q);
return startOrderPrep(referenced,requestedQty);
}
if(wantsOrderPrep(q) && !referenced){
return {text:'🧾 Sifarişə başlamaq üçün hansı məhsulu nəzərdə tutduğunu de. Məsələn: “Domino qutusunu sifarişə hazırla”.',chips:[{label:'👀 Sonuncunu seç',text:'Birincini göstər'},{label:'🛍️ Səbəti göstər',text:'Səbətimdə nə var?'},{label:'🎁 Hədiyyə seç',text:'Mənə hədiyyə seç'}]};
}
if(referenced && wantsAddToCart(q)){
s.chatMemory.lastSelectedProduct=referenced;
const requestedQty=ctx.extractQuantity(q)||1;
if(referenced.customizable){
ctx.openCustomization?.(referenced.id);
return requestedQty>1
? {text:`✨ ${referenced.name} fərdi məhsuldur. Fərdiləşdirmə pəncərəsini açdım; ${requestedQty} ədəd üçün əvvəlcə dizaynı tamamla, sonra səbətdə miqdarı artıra bilərsən.`}
: {text:`✨ ${referenced.name} fərdi məhsuldur. Fərdiləşdirmə pəncərəsini açdım; detalları seçib səbətə əlavə edə bilərsiniz.`};
}
const added=addStandardProductQuantity(referenced,requestedQty);
if(!added.ok){
return {text:`⚠️ ${referenced.name}: ${added.message||'səbətə əlavə etmək mümkün olmadı.'}`,chips:[{label:'👀 Detallara bax',text:'Bunun detallarını göstər'},{label:'🛍️ Səbət',text:'Səbətimdə nə var?'}]};
}
return {text:`✅ ${referenced.name} səbətə ${requestedQty} ədəd əlavə edildi. Təxmini səbət cəmi ${money(ctx.getEstimatedOrderTotal?.()||0)}.`,chips:[{label:'🛍️ Səbəti göstər',text:'Səbətimdə nə var?'},{label:'🧾 Sifarişi tamamla',text:'Sifarişi necə verim?'}]};
}
if(referenced && wantsPositionOnly(q)){
s.chatMemory.lastSelectedProduct=referenced;
if(wantsCustomize(q)){
ctx.openCustomization?.(referenced.id);
return {text:`✨ ${referenced.name} üçün fərdiləşdirmə pəncərəsini açdım.`};
}
ctx.openProductModal?.(referenced.id);
clearPendingAction();
return {text:`👀 ${referenced.name} üçün məhsul detallarını açdım.`,chips:[{label:'💰 Qiymət',text:'Bunun qiyməti nədir?'},{label:'⏱️ Hazırlanma',text:'Bu neçə günə hazır olur?'},{label:'🛒 Səbətə at',text:'Bunu səbətə at'}]};
}
if(referenced){
const attribute=['time','price','material','stock','size','customize'].find(attr=>wantsProductAttribute(q,attr));
const attributeReply=attribute==='customize' ? (wantsCustomize(q) ? describeReferencedProduct(referenced,'customize') : null) : describeReferencedProduct(referenced,attribute);
if(attributeReply){
s.chatMemory.lastSelectedProduct=referenced;
s.chatMemory.lastIntent='product-info';
return {text:attributeReply,chips:[{label:'👀 Detallara bax',text:'Bunun detallarını göstər'},{label:'✨ Fərdiləşdir',text:'Bunu fərdiləşdir'},{label:'🛒 Səbətə at',text:'Bunu səbətə at'}]};
}
}
if(referenced && wantsCustomize(q)){
s.chatMemory.lastSelectedProduct=referenced;
ctx.openCustomization?.(referenced.id);
return {text:`✨ ${referenced.name} üçün fərdiləşdirmə pəncərəsini açdım. Buradan yazı, rəng, ölçü və digər detalları seçə bilərsiniz.`};
}
if(referenced && wantsDetails(q) && !wantsAlternative(q)){
s.chatMemory.lastSelectedProduct=referenced;
ctx.openProductModal?.(referenced.id);
return {text:`👀 ${referenced.name} üçün məhsul detallarını açdım.`};
}
if(/(?:fərdi dizayn|ferdi dizayn|dizayn studiyası|dizayn studiyasi|necə fərdiləşdir|nece ferdilestir)/i.test(l)){
return {text:'🎨 Fərdi məhsullarda məhsulu seçib “Fərdiləşdir” düyməsinə basa bilərsiniz. Design Studio-da yazı, şəkil, rəng, ölçü və yerləşimi dəyişib dizaynı səbətə əlavə etmək mümkündür.'};
}
if(wantsAlternative(q) && s.chatMemory.lastMentionedProducts?.length){
const alternatives=getAlternativeProducts(q,found);
if(alternatives.length){
s.chatMemory.lastMentionedProducts=alternatives;
s.chatMemory.lastSelectedProduct=alternatives[0] || null;
const colorHint=fuzzyHasAny(q,['rəng','reng']) ? ' Rəng üzrə ayrıca variant məlumatı kataloqda qeyd olunmayıb, ona görə başqa model/variantları göstərirəm.' : '';
s.chatMemory.lastIntent='alternative';
return {text:`🔁 Əvvəlkilərdən fərqli variantlar tapdım.${colorHint}`,items:alternatives,chips:[{label:'💰 Daha ucuz',text:'Bunlardan daha ucuz variantlar göstər'},{label:'⚖️ İlk ikisini müqayisə et',text:'İlk iki variantı müqayisə et'},{label:'✨ Birincini fərdiləşdir',text:'Birincini fərdiləşdir'}]};
}
return {text:'Hazırkı kataloqda əvvəlkilərdən fərqli uyğun variant tapa bilmədim. Büdcəni və ya məhsul tipini dəyişib yenidən baxa bilərik.',chips:responseChips({hasResults:true})};
}
if(wantsExtremeFromResults(q,'low') && s.chatMemory.lastMentionedProducts?.length){
const chosen=s.chatMemory.lastMentionedProducts.filter(Boolean).slice().sort((a,b)=>a.price-b.price)[0];
if(chosen){
s.chatMemory.lastSelectedProduct=chosen;
return {text:`💸 Bu nəticələr arasında ən ucuz variant ${chosen.name} — ${money(chosen.price)}.`,items:[chosen],chips:[{label:'👀 Detallara bax',text:'Birincini göstər'},{label:'✨ Fərdiləşdir',text:'Bunu fərdiləşdir'},{label:'🛒 Səbətə at',text:'Bunu səbətə at'}]};
}
}
if(wantsExtremeFromResults(q,'high') && s.chatMemory.lastMentionedProducts?.length){
const chosen=s.chatMemory.lastMentionedProducts.filter(Boolean).slice().sort((a,b)=>b.price-a.price)[0];
if(chosen){
s.chatMemory.lastSelectedProduct=chosen;
return {text:`💎 Bu nəticələr arasında ən bahalı variant ${chosen.name} — ${money(chosen.price)}.`,items:[chosen],chips:[{label:'👀 Detallara bax',text:'Birincini göstər'},{label:'✨ Fərdiləşdir',text:'Bunu fərdiləşdir'},{label:'🛒 Səbətə at',text:'Bunu səbətə at'}]};
}
}
if(wantsPriceDirection(q,'low') && s.chatMemory.lastMentionedProducts?.length){
const pool=s.chatMemory.lastMentionedProducts.filter(Boolean).sort((a,b)=>a.price-b.price);
const max=pool[0]?.price ?? Infinity;
const candidates=s.products.filter(p=>p.price<max).sort((a,b)=>a.price-b.price).slice(0,4);
if(candidates.length){
s.chatMemory.lastMentionedProducts=candidates;
return {text:`💸 ${money(max)}-dan daha münasib variantlar:`,items:candidates,chips:responseChips({hasResults:true,hasBudget:true})};
}
return {text:'Bu nəticələrdən daha ucuz hazır variant tapa bilmədim. Büdcəni dəyişə və ya başqa tip məhsul axtara bilərik.'};
}
if(wantsPriceDirection(q,'high') && s.chatMemory.lastMentionedProducts?.length){
const pool=s.chatMemory.lastMentionedProducts.filter(Boolean).sort((a,b)=>a.price-b.price);
const max=pool[pool.length-1]?.price ?? 0;
const candidates=s.products.filter(p=>p.price>max).sort((a,b)=>a.price-b.price).slice(0,4);
if(candidates.length){
s.chatMemory.lastMentionedProducts=candidates;
return {text:`💎 ${money(max)}-dan yuxarı variantlar:`,items:candidates,chips:responseChips({hasResults:true})};
}
return {text:'Hazır siyahıda daha bahalı uyğun variant yoxdur.'};
}
let results=found.length?[...found]:[...s.products];
if(tags.length) results=results.filter(p=>tags.some(tag=>p.tags?.includes(tag)));
if(budget) results=results.filter(p=>p.price>=budget.min && p.price<=budget.max);
s.chatMemory.lastFilters={budget,tags,query:l};
s.chatMemory.lastQuery=l;
s.chatMemory.lastIntent='product-search';
if(!results.length && budget){
return {text:tags.length
? `${budget.min>0?`${budget.min}–${budget.max}`:`${budget.max}`} ₼ büdcəsində seçdiyiniz şəxs üçün uyğun məhsul tapılmadı. Daha geniş büdcə və ya başqa kateqoriya ilə yoxlaya bilərik.`
: `${budget.min>0?`${budget.min}–${budget.max}`:`${budget.max}`} ₼ büdcəsində uyğun məhsul tapılmadı. Büdcəni dəyişib yenidən baxa bilərik.`};
}
results=results.slice().sort((a,b)=>{
const aTag=tags.reduce((n,t)=>n+(a.tags?.includes(t)?1:0),0);
const bTag=tags.reduce((n,t)=>n+(b.tags?.includes(t)?1:0),0);
if(bTag!==aTag) return bTag-aTag;
return a.price-b.price;
}).slice(0,4);
const asksCatalog=fuzzyHasAny(q,['nə var','məhsul','hədiyyə','göstər','variant','nə məsləhət']);
if(results.length && (found.length||budget||tags.length||asksCatalog)){
s.chatMemory.lastMentionedProducts=results;
s.chatMemory.lastSelectedProduct=results[0] || null;
const intro=budget
? (budget.min>0?`${budget.min}–${budget.max} ₼ aralığında uyğun variantlar:`:`${budget.max} ₼-ə qədər uyğun variantlar:`)
: tags.length ? 'Sizin üçün uyğun variantlar:' : 'Uyğun variantlar:';
return {text:intro,items:results,chips:responseChips({hasResults:true,hasBudget:Boolean(budget),hasSelected:Boolean(results[0])})};
}
if(/(?:qiymət|qiymet|neçəyə|neceye|neçəsi|necesi)/i.test(l) && found.length){
return {text:found.slice(0,4).map(p=>`${p.name} — ${money(p.price)}`).join('\n'),chips:[{label:'👀 Birincini göstər',text:'Birincini göstər'},{label:'🛒 Birincini səbətə at',text:'Birincini səbətə at'}]};
}
return {text:'İstəyinizi tam başa düşmədim. Məsələn: “30 AZN-ə sevgilim üçün nə var?”, “20–30 AZN arası”, “domino”, “bunu fərdiləşdir”, “çatdırılma neçəyədir?” yaza bilərsiniz.',chips:responseChips()};
}
function processBotQuery(q){
  rememberUserTurn(q);
  const reply=processBotQueryCore(q);
  rememberDialogue(q,reply);
  return proactiveNextStep(adaptConversationResponse(reply,q),q);
}
Object.assign(ctx, {
toggleChat,
toggleChatFullscreen,
clearChat,
sendQuickMsg,
appendMsg,
sendChatMsg,
inferChatTags,
extractBudget,
updateConversationProfile,
profileHasSignal,
profileRecipient,
profileIsReady,
productMatches,
wantsAddToCart,
wantsCustomize,
wantsDetails,
processBotQuery,
wantsCompare,
wantsGiftWizard,
wantsExtremeFromResults,
wantsCancelWizard,
budgetLabel,
parseOccasion,
startGiftWizard,
continueGiftWizard,
giftRecommendations,
wantsAlternative,
getAlternativeProducts,
wantsRecommendation,
wantsCompanion,
wantsResultsTotal,
wantsCartCount,
wantsCartClear,
getRecommendationProducts,
getCompanionProducts,
extractQuantity,
wantsAffirmative,
wantsNegative,
wantsProductionSummary,
parseProductionDays,
setPendingAction,
clearPendingAction,
validateOrderPrepCart,
checkoutPreflight,
wantsCheckoutCommand,
openCheckoutFromOrderPrep,
wantsHelpOrUncertainty,
wantsObjection,
wantsContextualFollowup,
conversationGoal,
rememberDialogue,
proactiveNextStep
});
}
