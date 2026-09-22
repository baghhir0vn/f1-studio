import { escapeHTML, money, normalizeText } from './ui.js';
import { CONFIG } from './config.js';
import { state as s, ctx } from './state.js';

const synonymMap = {
    "lipa":[1,2], "nömrə":[1,2], "nomre":[1,2], "alışqan":[3], "domino":[4], "taxta":[4,5,6,12],
    "lazer":[4,5,6,12], "masaüstü":[6], "saat":[7,8], "qol saatı":[8], "şəkil":[9], "3x4":[9],
    "foto":[9], "banner":[10], "vinil":[10], "stiker":[11], "brelok":[11], "maket":[12]
};

export function initChat() {
    const chatAliasMap={
        sevgili:["sevgili","sevgilim","sevgilimə","sevgiliyə","sevgilime","sevgiliye","qız dostum","oglan dostum"],
        ana:["ana","anam","anama","anama","ana üçün","ana ucun"],
        ata:["ata","atam","atama","ata üçün","ata ucun"],
        dost:["dost","dostum","dosta","həmkar","hemkar"],
        uşaq:["uşaq","uşağa","usaq","usağa","uşaqlar"],
        ad_gunu:["ad günü","ad gunu","adgünü","adgünü"],
        xususi_gun:["xüsusi gün","xususi gun","ildönümü","ildonumu","nişan","nisan"]
    };

    function toggleChat(){const box=document.getElementById("chatBox"),btn=document.querySelector(".chat-trigger"); const open=box.classList.toggle("open"); btn?.setAttribute("aria-expanded",String(open));}
    
    function sendQuickMsg(txt){document.getElementById("chatInput").value=txt;ctx.sendChatMsg();}
    
    function appendMsg(text,sender,items=[]){
        const body=document.getElementById("chatBody"); const msg=document.createElement("div"); msg.className=`chat-msg ${sender}`; msg.textContent=text; body.appendChild(msg);
        items.forEach(p=>{const card=document.createElement("div");card.className="chat-product-card";card.innerHTML=`<div class="emoji">${escapeHTML(p.emoji)}</div><div class="details"><b>${escapeHTML(p.name)}</b><span>${money(p.price)}</span></div>`; const b=document.createElement("button");b.type="button";b.textContent="🛒 Səbətə at";b.onclick=()=>ctx.add(p.id);card.appendChild(b);msg.appendChild(card);});
        body.scrollTop=body.scrollHeight;
    }
    
    function sendChatMsg(){
        const input=document.getElementById("chatInput"), text=input.value.trim(); if(!text) return;
        ctx.appendMsg(text,"user"); input.value="";
        const typingId="typing-"+Date.now(), body=document.getElementById("chatBody"); const typ=document.createElement("div");typ.id=typingId;typ.className="typing-indicator";typ.innerHTML='<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';body.appendChild(typ);
        setTimeout(()=>{document.getElementById(typingId)?.remove(); const reply=ctx.processBotQuery(text); ctx.appendMsg(reply.text,"bot",reply.items||[]);},500);
    }
    
    function inferChatTags(q){
        const l=normalizeText(q), tags=new Set();
        Object.entries(chatAliasMap).forEach(([tag,words])=>words.forEach(w=>{if(l.includes(normalizeText(w))) tags.add(tag);}));
        return [...tags];
    }
    
    function extractBudget(q){
        const l=normalizeText(q).replace(/,/g,".");
        const range=l.match(/\b(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(?:azn|manat|₼)?(?:\s*(?:arası|arasi|arasında|arasinda))?/i);
        if(range){return {min:Number(range[1]),max:Number(range[2]),exact:false};}
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
            if(l.includes(normalizeText(p.name))) score+=30;
            Object.entries(synonymMap).forEach(([word,ids])=>{if(ids.includes(p.id)&&l.includes(normalizeText(word))) score+=10;});
            p.tags?.forEach(t=>{if(wantedTags.includes(t)) score+=8;});
            if(l.includes(normalizeText(p.cat.split(" ")[0]))) score+=3;
            return {p,score};
        }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).map(x=>x.p);
    }
    
    function wantsAddToCart(q, hasProduct){
        if(!hasProduct) return false;
        const l=normalizeText(q);
        return /(?:səbətə\s*(?:at|əlavə)|sebetə\s*(?:at|elave)|əlavə\s+et|elave\s+et|satın\s+al|satinal|götür|gotur)/i.test(l) || /\bsifariş\s+ver/i.test(l);
    }
    
    function processBotQuery(q){
        const l=normalizeText(q), found=ctx.productMatches(q), budget=ctx.extractBudget(q), tags=ctx.inferChatTags(q);
        if(/sağ ol|sag ol|çox sağ ol|cox sag ol|təşəkkür|tesekkur|çox sağol/i.test(l)) return {text:"Buyurun! 😊 Başqa sualınız olsa, buradayam."};
        if(/sağol|sagol|hələlik|helelik|görüşərik|gorusərik|gorusərik/i.test(l)) return {text:"Hələlik! 👋"};
        if(/çatdırılma|kuryer|poçt|göndəriş|rayon/i.test(l)) return {text:`🚚 Çatdırılma: mağazadan götürmə ${CONFIG.delivery.pickup===0?"pulsuzdur":money(CONFIG.delivery.pickup)}; Gəncə daxili ${money(CONFIG.delivery.ganja)}, bölgələrə poçt ${money(CONFIG.delivery.region)}.`};
        if(/ünvan|harda|harada|iş saat|necə işləyir|maqazin|mağaza/i.test(l)) return {text:`📍 ${document.getElementById("siteAddressText")?.textContent?.trim()||"Ünvan ayarlarda qeyd olunmayıb."} İş saatları: I–V ${document.getElementById("siteWeekdayHoursText")?.textContent?.replace(/^I - V günlər:\s*/,"")||""}, VI–VII ${document.getElementById("siteWeekendHoursText")?.textContent?.replace(/^VI - VII günlər:\s*/,"")||""}.`};
        if(/^(salam|salamlar|hi|sabahın xeyir|axşamın xeyir|necəsiz)/i.test(l)) return {text:"Salam! 👋 Məhsul, büdcə, çatdırılma və ünvan barədə kömək edə bilərəm."};
        if(found.length && ctx.wantsAddToCart(q,true)){ const p=found[0]; if(p.customizable){ ctx.openCustomization(p.id); return {text:`✨ ${p.name} üçün fərdi sifariş pəncərəsini açdım. Yazı, rəng, ölçü və digər detalları seçib səbətə əlavə edə bilərsiniz.`}; } ctx.add(p.id); return {text:`✅ ${p.name} səbətə əlavə olundu.`}; }
    
        let results=found.length?[...found]:[...s.products];
        if(tags.length) results=results.filter(p=>tags.some(tag=>p.tags?.includes(tag)));
        if(budget){
            results=results.filter(p=>p.price>=budget.min && p.price<=budget.max);
        }
        if(!results.length && budget){
            return {text:tags.length
                ? `${budget.min>0?`${budget.min}–${budget.max}`:`${budget.max}`} ₼ büdcəsində seçdiyiniz şəxs üçün hazır uyğun məhsul tapılmadı. Büdcəni bir qədər artırmaq və ya meyarı dəyişmək olar.`
                : `${budget.min>0?`${budget.min}–${budget.max}`:`${budget.max}`} ₼ büdcəsində uyğun məhsul tapılmadı.`};
        }
        results=results.slice().sort((a,b)=>{
            const aTag=tags.reduce((n,t)=>n+(a.tags?.includes(t)?1:0),0);
            const bTag=tags.reduce((n,t)=>n+(b.tags?.includes(t)?1:0),0);
            if(bTag!==aTag) return bTag-aTag;
            return a.price-b.price;
        }).slice(0,4);
        if(results.length){
            s.chatMemory.lastMentionedProducts=results;
            const intro=budget ? (budget.min>0?`${budget.min}–${budget.max} ₼ aralığında uyğun variantlar:`:`${budget.max} ₼-ə qədər uyğun variantlar:`) : `Uyğun variantlar:`;
            return {text:intro,items:results};
        }
        return {text:"İstəyinizi tam anlamadım. Məsələn: “30 AZN-ə sevgilim üçün nə var?”, “20-30 AZN arası hədiyyə”, “domino”, “çatdırılma”, “ünvan” yaza bilərsiniz."};
    }

    Object.assign(ctx, {
    toggleChat,
    sendQuickMsg,
    appendMsg,
    sendChatMsg,
    inferChatTags,
    extractBudget,
    productMatches,
    wantsAddToCart,
    processBotQuery
    });
}
