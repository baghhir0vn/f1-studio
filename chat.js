import { escapeHTML, money, normalizeText, showToast } from './ui.js';
import { CONFIG } from './config.js';
import { state as s, ctx } from './state.js';

const synonymMap = {
    "lipa":[1,2], "nömrə":[1,2], "nomre":[1,2], "alışqan":[3], "alışqan yazı":[3], "domino":[4], "taxta":[4,5,6,12],
    "lazer":[4,5,6,12], "masaüstü":[6], "masaustu":[6], "saat":[7,8], "qol saatı":[8], "qol saati":[8], "şəkil":[9], "sekil":[9], "3x4":[9],
    "foto":[9], "banner":[10], "vinil":[10], "stiker":[11], "sticker":[11], "brelok":[11], "maket":[12]
};

const CHAT_MAX_LENGTH = 500;
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

    // Short UI "tak" sound for newly sent user/bot messages.
    // Web Audio is used so no external audio asset is needed; failures are silent.
    let chatAudioContext = null;
    function playChatTick(sender){
        try{
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if(!AudioCtx) return;
            chatAudioContext ||= new AudioCtx();
            if(chatAudioContext.state === "suspended") chatAudioContext.resume().catch(()=>{});

            const now = chatAudioContext.currentTime;
            const osc = chatAudioContext.createOscillator();
            const gain = chatAudioContext.createGain();
            osc.type = "sine";
            // Slightly different pitch keeps user/bot feedback distinct without becoming noisy.
            osc.frequency.setValueAtTime(sender === "bot" ? 620 : 760, now);
            osc.frequency.exponentialRampToValueAtTime(sender === "bot" ? 500 : 590, now + 0.055);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.055, now + 0.006);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
            osc.connect(gain);
            gain.connect(chatAudioContext.destination);
            osc.start(now);
            osc.stop(now + 0.075);
        }catch(_){}
    }

    const body = document.getElementById("chatBody");
    const input = document.getElementById("chatInput");
    const sendButton = document.querySelector('.chat-footer button[data-action="sendChatMsg"]');
    const welcomeMarkup = body?.innerHTML || '';
    let chatBusy = false;
    let pendingTimer = null;

    if (!s.chatMemory || typeof s.chatMemory !== 'object') s.chatMemory = {};
    Object.assign(s.chatMemory, {
        lastMentionedProducts: Array.isArray(s.chatMemory.lastMentionedProducts) ? s.chatMemory.lastMentionedProducts : [],
        lastSelectedProduct: s.chatMemory.lastSelectedProduct || null,
        lastFilters: s.chatMemory.lastFilters || null,
        turns: Number(s.chatMemory.turns || 0)
    });

    if(!s.chatMemory.giftWizard || typeof s.chatMemory.giftWizard !== 'object') s.chatMemory.giftWizard = null;

    function toggleChat(){
        const box=document.getElementById("chatBox"), btn=document.querySelector(".chat-trigger");
        if(!box) return;
        const open=box.classList.toggle("open");
        box?.setAttribute("aria-hidden",String(!open));
        btn?.setAttribute("aria-expanded",String(open));
        if(open) setTimeout(()=>document.getElementById("chatInput")?.focus(),0);
        else btn?.focus();
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
        const msg=document.createElement("div");
        msg.className=`chat-msg ${sender} chat-message-enter${sender === "bot" ? " chat-bot-message" : ""}`;
        msg.setAttribute('data-chat-message','true');
        msg.setAttribute('data-chat-sender',sender);
        msg.textContent=String(text || '');
        body.appendChild(msg);
        requestAnimationFrame(()=>msg.classList.add('is-visible'));
        playChatTick(sender);

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
        s.chatMemory.giftWizard=null;
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
        const l=normalizeText(q), tags=new Set();
        Object.entries(chatAliasMap).forEach(([tag,words])=>words.forEach(w=>{
            const n=normalizeText(w);
            if(n && (l===n || l.includes(n))) tags.add(tag);
        }));
        return [...tags];
    }

    function extractBudget(q){
        const l=normalizeText(q).replace(/,/g,".");
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

    function productMatches(q){
        const l=normalizeText(q), wantedTags=ctx.inferChatTags(q);
        return s.products.map(p=>{
            let score=0;
            const name=normalizeText(p.name);
            if(name && l.includes(name)) score+=40;
            Object.entries(synonymMap).forEach(([word,ids])=>{ if(ids.includes(p.id)&&l.includes(normalizeText(word))) score+=12; });
            p.tags?.forEach(t=>{ if(wantedTags.includes(t)) score+=8; });
            if(p.cat && l.includes(normalizeText(p.cat))) score+=6;
            else if(p.cat && l.includes(normalizeText(p.cat.split(' ')[0]))) score+=3;
            return {p,score};
        }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score || a.p.price-b.p.price).map(x=>x.p);
    }

    function wantsAddToCart(q, hasProduct){
        if(!hasProduct) return false;
        const l=normalizeText(q);
        return /(?:səbətə\s*(?:at|əlavə)|sebetə\s*(?:at|elave)|əlavə\s+et|elave\s+et|satın\s*al|satinal|götür|gotur|sifariş\s*ver)/i.test(l);
    }

    function wantsCustomize(q){
        const l=normalizeText(q);
        return /(?:fərdiləşdir|ferdilestir|dizayn\s*et|yazı\s*əlavə|yazi\s*elave|üstünə\s*yazı|ustune\s*yazi|xüsusi\s*sifariş|xususi\s*sifaris)/i.test(l);
    }

    function wantsDetails(q){
        const l=normalizeText(q);
        return /(?:ətraflı|etraflı|etraflı|detal|məlumat|melumat|göstər|goster|bax|baxmaq|şəkli|sekli)/i.test(l);
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
        if(wizard.step==='recipient' && recipient) wizard.recipient=recipient;
        if(!wizard.budget && budget) wizard.budget=budget;
        if(!wizard.occasion && occasion) wizard.occasion=occasion;
        if(wizard.recipient && !wizard.budget){ wizard.step='budget'; return {text:`Super, ${giftRecipientLabel(wizard.recipient)} üçün seçim edirəm. Büdcən nə qədərdir?`,chips:[{label:'💸 0–20 ₼',text:'0–20 AZN'},{label:'💰 20–50 ₼',text:'20–50 AZN'},{label:'💎 50+ ₼',text:'50 AZN-dən çox'}]}; }
        if(wizard.budget && !wizard.occasion){ wizard.step='occasion'; return {text:'Büdcəni nəzərə alacağam. Hansı münasibət üçündür?',chips:[{label:'🎂 Ad günü',text:'Ad günü üçün'},{label:'✨ Xüsusi gün',text:'Xüsusi gün üçün'},{label:'🎁 Sadəcə hədiyyə',text:'Sadəcə hədiyyədir'}]}; }
        if(wizard.recipient && wizard.budget){
            s.chatMemory.giftWizard=null;
            const items=giftRecommendations(wizard);
            s.chatMemory.lastMentionedProducts=items;
            s.chatMemory.lastSelectedProduct=items[0] || null;
            return {text:`🎁 Hazırdır! ${giftRecipientLabel(wizard.recipient)} üçün ${wizard.budget.min>0?`${wizard.budget.min}–${wizard.budget.max}`:`${wizard.budget.max}`} ₼ aralığında uyğun variantları seçdim:`,items,chips:[{label:'⚖️ İlk ikisini müqayisə et',text:'İlk iki variantı müqayisə et'},{label:'✨ Birincini fərdiləşdir',text:'Birincini fərdiləşdir'},{label:'💸 Daha ucuz',text:'Bunlardan daha ucuz variantlar göstər'}]};
        }
        return null;
    }

    function compareProducts(q, found){
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

    function processBotQuery(q){
        const l=normalizeText(q).slice(0,CHAT_MAX_LENGTH);
        if(!l) return {text:'Mesajınızı yazın, kömək edim.'};
        s.chatMemory.turns=(Number(s.chatMemory.turns)||0)+1;

        const inGiftWizard=continueGiftWizard(q);
        if(inGiftWizard) return inGiftWizard;
        if(wantsGiftWizard(q)) return startGiftWizard(q);

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

        const budget=ctx.extractBudget(q);
        const tags=ctx.inferChatTags(q);
        const found=ctx.productMatches(q);

        if(wantsCompare(q)) {
            const comparison=compareProducts(q,found);
            if(comparison.length>=2){
                s.chatMemory.lastMentionedProducts=comparison;
                s.chatMemory.lastSelectedProduct=comparison[0];
                return {text:`⚖️ İki məhsulu əsas xüsusiyyətlərinə görə müqayisə etdim.`,comparison,chips:[{label:'👀 Birincini göstər',text:'Birincini göstər'},{label:'👀 İkincini göstər',text:'İkincini göstər'},{label:'✨ Birincini fərdiləşdir',text:'Birincini fərdiləşdir'}]};
            }
            return {text:'Müqayisə etmək üçün ən azı iki məhsul seçməliyik. Məsələn: “Lipa ilə alışqanı müqayisə et” və ya “İlk iki variantı müqayisə et”.',chips:[{label:'🎁 Hədiyyə seç',text:'Mənə hədiyyə seç'},{label:'🛍️ Məhsullar',text:'Məhsulları göstər'}]};
        }

        const referenced=getReferencedProduct(q,found);
        if(referenced && wantsCustomize(q)){
            s.chatMemory.lastSelectedProduct=referenced;
            ctx.openCustomization?.(referenced.id);
            return {text:`✨ ${referenced.name} üçün fərdiləşdirmə pəncərəsini açdım. Buradan yazı, rəng, ölçü və digər detalları seçə bilərsiniz.`};
        }
        if(referenced && wantsAddToCart(q)){
            s.chatMemory.lastSelectedProduct=referenced;
            if(referenced.customizable){
                ctx.openCustomization?.(referenced.id);
                return {text:`✨ ${referenced.name} fərdi məhsuldur. Fərdiləşdirmə pəncərəsini açdım; detalları seçib səbətə əlavə edə bilərsiniz.`};
            }
            ctx.add?.(referenced.id);
            return {text:`✅ ${referenced.name} səbətə əlavə edildi.`};
        }
        if(referenced && wantsDetails(q)){
            s.chatMemory.lastSelectedProduct=referenced;
            ctx.openProductModal?.(referenced.id);
            return {text:`👀 ${referenced.name} üçün məhsul detallarını açdım.`};
        }

        if(/(?:fərdi dizayn|ferdi dizayn|dizayn studiyası|dizayn studiyasi|necə fərdiləşdir|nece ferdilestir)/i.test(l)){
            return {text:'🎨 Fərdi məhsullarda məhsulu seçib “Fərdiləşdir” düyməsinə basa bilərsiniz. Design Studio-da yazı, şəkil, rəng, ölçü və yerləşimi dəyişib dizaynı səbətə əlavə etmək mümkündür.'};
        }

        if(/(?:daha ucuz|ucuz|ən ucuz|en ucuz)/i.test(l) && s.chatMemory.lastMentionedProducts?.length){
            const pool=s.chatMemory.lastMentionedProducts.filter(Boolean).sort((a,b)=>a.price-b.price);
            const max=pool[0]?.price ?? Infinity;
            const candidates=s.products.filter(p=>p.price<max).sort((a,b)=>a.price-b.price).slice(0,4);
            if(candidates.length){
                s.chatMemory.lastMentionedProducts=candidates;
                return {text:`💸 ${money(max)}-dan daha münasib variantlar:`,items:candidates,chips:responseChips({hasResults:true,hasBudget:true})};
            }
            return {text:'Bu nəticələrdən daha ucuz hazır variant tapa bilmədim. Büdcəni dəyişə və ya başqa tip məhsul axtara bilərik.'};
        }
        if(/(?:daha bahalı|daha bahali|bahalı|bahali)/i.test(l) && s.chatMemory.lastMentionedProducts?.length){
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

        const asksCatalog=/(?:nə var|ne var|məhsul|mehsul|hədiyyə|hediyye|göstər|goster|variant|nə məsləhət|ne meslehet)/i.test(l);
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

    Object.assign(ctx, {
        toggleChat,
        clearChat,
        sendQuickMsg,
        appendMsg,
        sendChatMsg,
        inferChatTags,
        extractBudget,
        productMatches,
        wantsAddToCart,
        wantsCustomize,
        wantsDetails,
        processBotQuery,
        wantsCompare,
        wantsGiftWizard,
        parseOccasion,
        startGiftWizard,
        continueGiftWizard,
        giftRecommendations
    });
}
