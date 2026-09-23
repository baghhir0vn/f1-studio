import { escapeHTML, money, showToast } from './ui.js?v=59.3';
import { storageService } from './services/storage-service.js?v=59.3';
import { authService } from './services/auth-service.js?v=59.3';
import { state as s, ctx } from './state.js?v=59.3';
export function initCustomization() {
    function resetCustomizationForm(){
        s.customProductId=null; s.customEditingLineId=null; s.customExistingImageName=""; s.customExistingImageUrl=""; s.customExistingImagePath=""; s.customDesignLayout=null;
        ["customText","customNote"].forEach(id=>document.getElementById(id).value="");
        document.getElementById("customColor").value="Qara";
        document.getElementById("customSize").value="Standart";
        document.getElementById("customSizeValue").value="";
        document.getElementById("customSizeValue").style.display="none";
        document.getElementById("customFont").value="Klassik";
        document.getElementById("customImage").value="";
        document.getElementById("customImageName").textContent="Fayl seçilməyib";
        document.getElementById("customPreview").innerHTML='<span>Fərdi dizaynınızı burada seçin</span>';
        if(s.customObjectUrl){URL.revokeObjectURL(s.customObjectUrl); s.customObjectUrl=null;}
        ctx.resetDesignStudio?.();
    }
    function openCustomization(id, lineId=null){
        if(!ctx.ensureCatalogReady()) return;
        const p=ctx.getProduct(id); if(!p) return;
        ctx.resetCustomizationForm();
        s.customProductId=p.id; s.customEditingLineId=lineId;
        document.getElementById("customModalTitle").textContent=lineId?"✏️ Fərdi sifarişi dəyiş":"✨ Fərdi sifariş";
        if(!lineId){
            const draft=ctx.loadDesignDraft?.(p.id);
            if(draft){
                s.customDesignLayout=draft;
                ctx.restoreDesignLayout?.(draft);
                const t=draft.text||{};
                document.getElementById("customText").value=t.text||"";
                document.getElementById("customFont").value=t.font||"Klassik";
                document.getElementById("customColor").value=(Object.entries({Qara:"#111",Ağ:"#fff",Qızılı:"#b88919",Gümüşü:"#8b9299",Digər:"#333"}).find(([,v])=>v===t.color)?.[0])||"Qara";
                if(document.getElementById("customFontSize")) document.getElementById("customFontSize").value=String(t.fontSize||28);
                if(document.getElementById("customTextAlign")) document.getElementById("customTextAlign").value=t.align||"center";
                document.getElementById("customImageName").textContent="💾 Son saxlanmış dizayn qaralaması bərpa edildi.";
            }
        }
        document.getElementById("customProductName").textContent=`${p.name} · ${money(p.price)}`;
        document.getElementById("customSubmitBtn").textContent=lineId?"✅ Dəyişiklikləri yadda saxla":"🛒 Fərdiləşdir və səbətə əlavə et";
        if(lineId){
            const item=s.cart.find(i=>i.lineId===lineId), c=item?.customization;
            if(c){
                document.getElementById("customText").value=c.text||"";
                document.getElementById("customColor").value=c.color||"Qara";
                document.getElementById("customSize").value=c.size||"Standart";
                document.getElementById("customSizeValue").value=c.sizeValue||"";
                document.getElementById("customFont").value=c.font||"Klassik";
                s.customExistingImageName=c.imageName||"";
                s.customExistingImagePath=c.imagePath||"";
                s.customExistingImageUrl="";
                document.getElementById("customNote").value=c.note||"";
                document.getElementById("customImageName").textContent=c.imageName?`Seçilmiş fayl: ${c.imageName}`:"Fayl seçilməyib";
                s.customDesignLayout=c.layout||null;
                ctx.restoreDesignLayout?.(s.customDesignLayout);
            }
        }
        ctx.toggleCustomSizeValue();
        ctx.updateCustomizationPreview();
        ctx.syncDesignStudio?.();
        if (s.customExistingImagePath && lineId) {
            ctx.loadExistingDesignIntoStudio?.(s.customExistingImagePath);
        }
        ["customText","customColor","customSize","customFont","customSizeValue"].forEach(id=>document.getElementById(id).oninput=updateCustomizationPreview);
        ["customColor","customSize","customFont"].forEach(id=>document.getElementById(id).onchange=updateCustomizationPreview);
        ctx.openDialog("customModal", "#customText");
    }
    function closeCustomModal(){
        ctx.closeDialog("customModal");
        if(s.customObjectUrl){URL.revokeObjectURL(s.customObjectUrl);s.customObjectUrl=null;}
    }
    function toggleCustomSizeValue(){
        const select=document.getElementById("customSize"), input=document.getElementById("customSizeValue");
        const custom=select.value==="Xüsusi ölçü";
        input.style.display=custom?"block":"none";
        if(!custom) input.value="";
        ctx.updateCustomizationPreview();
    }
    function handleCustomImage(input){
        const file=input.files?.[0];
        const status=document.getElementById("customImageName");
        if(!file){
            status.textContent=s.customExistingImageName?`Seçilmiş fayl: ${s.customExistingImageName}`:"Fayl seçilməyib";
            ctx.updateCustomizationPreview();
            return;
        }
        const allowed=["image/png","image/jpeg","image/webp","application/pdf"];
        if(!allowed.includes(file.type)){
            input.value="";
            return showToast("Yalnız PNG, JPG, WEBP və PDF faylları qəbul olunur.");
        }
        if(file.size>10*1024*1024){
            input.value="";
            return showToast("Dizayn faylı maksimum 10 MB ola bilər.");
        }
        s.customExistingImageName="";
        s.customExistingImageUrl="";
        s.customExistingImagePath="";
        status.textContent=`Seçilmiş fayl: ${file.name} · ${(file.size/1024/1024).toFixed(2)} MB`;
        ctx.updateCustomizationPreview();
    }
    function updateCustomizationPreview(){
        const box=document.getElementById("customPreview");
        const text=document.getElementById("customText").value.trim();
        const color=document.getElementById("customColor").value;
        const font=document.getElementById("customFont").value;
        const file=document.getElementById("customImage").files?.[0];
        if(s.customObjectUrl){URL.revokeObjectURL(s.customObjectUrl);s.customObjectUrl=null;}
        if(file){
            s.customObjectUrl=URL.createObjectURL(file);
            if(file.type==="application/pdf"){
                box.innerHTML=`<div style="font-size:56px;">📄</div><div style="font-weight:700;margin-top:8px;">PDF maket</div><div style="font-size:12px;color:var(--muted);margin-top:4px;">${escapeHTML(file.name)}</div>`;
            } else {
                box.innerHTML=`<img src="${s.customObjectUrl}" alt="Seçilmiş şəkil üçün önbaxış"><div style="position:absolute;bottom:8px;left:10px;right:10px;background:rgba(0,0,0,.58);color:#fff;border-radius:8px;padding:5px;font-size:11px;">${escapeHTML(file.name)}</div>`;
            }
            box.style.position="relative";
            return;
        }
        if(text){
            const colorMap={Qara:"#111",Ağ:"#fff",Qızılı:"#b88919",Gümüşü:"#8b9299",Digər:"var(--ink)"};
            const fontMap={Klassik:"Georgia,serif",Modern:"Inter,system-ui,sans-serif",Qalın:"Arial Black,Arial,sans-serif",Əlyazma:"cursive","Operatorla seçim":"inherit"};
            const sizeValue=document.getElementById("customSizeValue").value.trim();
            const sizeLabel=document.getElementById("customSize").value+(sizeValue?` (${sizeValue})`:"");
            box.innerHTML=`<div class="preview-text" style="color:${colorMap[color]||"var(--ink)"};font-family:${fontMap[font]||"inherit"};text-shadow:${color==="Ağ"?"0 0 0 #222, 0 1px 2px rgba(0,0,0,.4)":"none"}">${escapeHTML(text)}</div><span style="position:absolute;bottom:6px;font-size:10px;color:var(--muted);">${escapeHTML(color)} · ${escapeHTML(sizeLabel)} · ${escapeHTML(font)}</span>`;
            box.style.position="relative";
        } else {
            box.innerHTML='<span>Fərdi dizaynınızı burada seçin</span>';
        }
    }
    function getCustomizationFormData(){
        const file=document.getElementById("customImage").files?.[0];
        ctx.saveDesignLayout?.();
        return {
            text:document.getElementById("customText").value.trim(),
            color:document.getElementById("customColor").value,
            size:document.getElementById("customSize").value,
            sizeValue:document.getElementById("customSizeValue").value.trim(),
            font:document.getElementById("customFont").value,
            imageName:file?.name||s.customExistingImageName||"",
            imagePath:s.customExistingImagePath||"",
            imageType:file?.type||"",
            imageSize:file?.size||0,
            note:document.getElementById("customNote").value.trim(),
            layout:s.customDesignLayout||null
        };
    }
    function customizationSignature(c){ return JSON.stringify(c||{}); }
    async function uploadCustomerDesign(file){
        if(!file) return null;
        const allowed=["image/png","image/jpeg","image/webp","application/pdf"];
        if(!allowed.includes(file.type)) throw new Error("DESIGN_FILE_TYPE");
        if(file.size>10*1024*1024) throw new Error("DESIGN_FILE_TOO_LARGE");
        const userData=await authService.getUser();
        const user=userData?.data?.user;
        if(!user) throw new Error("AUTH_REQUIRED");
        const extMap={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf"};
        const ext=extMap[file.type];
        if(!ext) throw new Error("DESIGN_FILE_TYPE");
        const token=globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():(()=>{
            const bytes=new Uint8Array(16);
            if(globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
            else return `${Date.now().toString(16)}-${Math.floor(Math.random()*1e12).toString(16)}`;
            bytes[6]=(bytes[6]&0x0f)|0x40; bytes[8]=(bytes[8]&0x3f)|0x80;
            const h=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
            return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
        })();
        const path=`orders/${user.id}/${token}.${ext}`;
        return storageService.uploadCustomerDesign(path, file);
    }
    async function confirmCustomization(){
        const p=ctx.getProduct(s.customProductId); if(!p) return;
        const submit=document.getElementById("customSubmitBtn");
        if(submit?.disabled) return;
        const customization=ctx.getCustomizationFormData();
        if(!customization.text && !customization.imageName && !customization.note){
            return showToast("Fərdi sifariş üçün ən azı yazı, şəkil və ya əlavə qeyd daxil edin.");
        }
        if(/lipa/i.test(p.name) && !customization.text){
            return showToast("Lipa nömrə üçün üzərinə yazılacaq mətn və ya nömrəni daxil edin.");
        }
        if(customization.size==="Xüsusi ölçü" && !customization.sizeValue){
            return showToast("Xüsusi ölçü seçmisiniz — ölçünü də yazın.");
        }
        const file=document.getElementById("customImage").files?.[0];
        if(p.stockQuantity!=null){
            const currentQty=s.cart.filter(i=>i.id===p.id && i.lineId!==s.customEditingLineId).reduce((sum,i)=>sum+(Number(i.qty)||0),0);
            const reservedForEdit=s.customEditingLineId?Number(s.cart.find(i=>i.lineId===s.customEditingLineId)?.qty||0):0;
            if(Number(p.stockQuantity)<=0) return showToast("Bu məhsul hazırda stokda yoxdur.");
            if(currentQty+Math.max(1,reservedForEdit)>Number(p.stockQuantity)) return showToast("Bu məhsul üçün stok limiti dolub.");
        }
        const oldText=submit?.textContent;
        try{
            if(submit){submit.disabled=true;submit.textContent=file?"⏳ Dizayn yüklənir...":"⏳ Yadda saxlanır...";}
            if(file){
                const uploaded=await ctx.uploadCustomerDesign(file);
                customization.imageName=uploaded.name;
                customization.imageUrl="";
                customization.imagePath=uploaded.path;
                customization.imageType=uploaded.type;
                customization.imageSize=uploaded.size;
            }
            if(s.customEditingLineId){
                const item=s.cart.find(i=>i.lineId===s.customEditingLineId);
                if(item){
                    const previousPath=item.customization?.imagePath||"";
                    item.customization=customization;
                    ctx.saveCart(); ctx.renderCart(); ctx.closeCustomModal();
                    if(previousPath && previousPath!==customization.imagePath){
                        storageService.removeCustomerDesigns([previousPath]).catch(()=>{});
                    }
                    showToast("Fərdi sifariş məlumatları yeniləndi.");
                    return;
                }
            }
            const existing=s.cart.find(i=>i.id===p.id && ctx.customizationSignature(i.customization)===ctx.customizationSignature(customization));
            if(existing){ existing.qty++; }
            else { s.cart.push({id:p.id,qty:1,lineId:ctx.makeClientId(`line-${p.id}`),customization}); }
            ctx.saveCart(); ctx.closeCustomModal(); ctx.openCart();
            showToast(`${p.name} fərdi parametrlərlə səbətə əlavə olundu.`);
        }catch(e){
            const raw=String(e?.message||e||"");
            const map={
                DESIGN_FILE_TYPE:"Dizayn faylı yalnız PNG, JPG, WEBP və ya PDF ola bilər.",
                DESIGN_FILE_TOO_LARGE:"Dizayn faylı maksimum 10 MB ola bilər.",
                AUTH_REQUIRED:"Dizayn faylı yükləmək üçün əvvəlcə hesabınıza daxil olun."
            };
            const friendly=map[raw] || (raw.startsWith("DESIGN_UPLOAD_FAILED:") ? `Dizayn yüklənmədi: ${raw.replace("DESIGN_UPLOAD_FAILED: ","")}` : "Fərdi sifariş yadda saxlanmadı.");
            showToast(friendly);
            console.error("F1 customization error",e);
        }finally{
            if(submit){submit.disabled=false;submit.textContent=oldText||"🛒 Fərdiləşdir və səbətə əlavə et";}
        }
    }
    Object.assign(ctx, {
    resetCustomizationForm,
    openCustomization,
    closeCustomModal,
    toggleCustomSizeValue,
    handleCustomImage,
    updateCustomizationPreview,
    getCustomizationFormData,
    customizationSignature,
    uploadCustomerDesign,
    confirmCustomization
    });
}
