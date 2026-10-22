import { escapeHTML, money, showToast } from './ui.js';
import { storageService } from './services/storage-service.js';
import { authService } from './services/auth-service.js';
import { inspectDesignFile, normalizeDesignFile } from './services/design-file-validation.js';
import { state as s, ctx } from './state.js';
export function initCustomization() {
    const customHistoryKey="__f1CustomModal";
    let customHistoryToken=null;
    let customBackPending=false;
    function studioImageLayerId(layout){return Array.isArray(layout?.layers)?layout.layers.find(layer=>layer?.type==="image")?.id||null:null;}
    function pushCustomHistoryEntry(){
        const token="f1-custom-"+Date.now()+"-"+Math.random().toString(36).slice(2);
        const current=window.history.state;
        const state=current && typeof current==="object" && !Array.isArray(current) ? current : {};
        window.history.pushState({...state,[customHistoryKey]:token},"",window.location.href);
        return token;
    }
    function closeCustomModal(options={}){
        const modal=document.getElementById("customModal");
        const wasOpen=!!modal?.classList.contains("open");
        ctx.closeDialog("customModal");
        if(s.customObjectUrl){URL.revokeObjectURL(s.customObjectUrl);s.customObjectUrl=null;}
        if(wasOpen){
            document.body.classList.remove("f1-custom-modal-open");
            ctx.resetCustomizationForm();
        }
        if(!options.fromHistory && customHistoryToken){
            const token=customHistoryToken;
            customHistoryToken=null;
            if(window.history.state?.[customHistoryKey]===token){
                customBackPending=true;
                window.history.back();
            }
        }
    }
    window.addEventListener("popstate",()=>{
        const isOpen=document.getElementById("customModal")?.classList.contains("open");
        if(customBackPending){
            customBackPending=false;
            if(isOpen && !customHistoryToken) customHistoryToken=pushCustomHistoryEntry();
            return;
        }
        if(isOpen && customHistoryToken){
            customHistoryToken=null;
            closeCustomModal({fromHistory:true});
        }
    });
    function resetCustomizationForm(){
        s.customProductId=null; s.customProductContext=null; s.customEditingLineId=null; s.customExistingImageName=""; s.customExistingImageUrl=""; s.customExistingImagePath=""; s.customExistingUploads=[]; s.customDesignLayout=null;
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
        // Opening a different product or closing the dialog must not carry
        // editor history into the next product. The form state has already
        // been cleared above, so this is a fresh editor session.
        ctx.resetDesignStudio?.({preserveHistory:false,persist:false});
    }
    function setProductSizeOptions(product,savedSize=""){
        const select=document.getElementById("customSize");
        if(!select) return;
        const declared=String(product?.size||"").split(/[;,/|]/).map(value=>value.trim()).filter(Boolean);
        const options=declared.filter(value=>!/(sifarişə görə|sifarişə uyğun|dəqiqləşdir)/i.test(value));
        if(!options.length) options.push("Məhsul üzrə dəqiqləşdirilir");
        select.replaceChildren();
        options.forEach(value=>{
            const option=document.createElement("option"); option.value=value; option.textContent=value; select.appendChild(option);
        });
        if(/sifarişə görə|sifarişə uyğun|dəqiqləşdir/i.test(String(product?.size||""))){
            const option=document.createElement("option"); option.value="Xüsusi ölçü"; option.textContent="Ölçü tələbi · operatorla təsdiqlənəcək"; select.appendChild(option);
        }
        if(savedSize&&!Array.from(select.options).some(option=>option.value===savedSize)){
            const legacy=document.createElement("option"); legacy.value=savedSize; legacy.textContent=`${savedSize} · saxlanmış seçim`; select.appendChild(legacy);
        }
        select.value=savedSize&&Array.from(select.options).some(option=>option.value===savedSize)?savedSize:options[0];
        const custom=select.value==="Xüsusi ölçü";
        const valueInput=document.getElementById("customSizeValue");
        if(valueInput){valueInput.style.display=custom?"block":"none";if(!custom)valueInput.value="";}
    }
    function openCustomization(productOrId, lineId=null){
        if(!ctx.ensureCatalogReady()) return;
        const productId=productOrId&&typeof productOrId==="object"?productOrId.id:productOrId;
        const p=ctx.getProduct(productId); if(!p) return;
        const modal=document.getElementById("customModal");
        const wasOpen=!!modal?.classList.contains("open");
        if(wasOpen&&ctx.hasUnsavedDesign?.()&&!window.confirm(`“${p.name}” məhsulunun fərdiləşdirməsi açılsın? Hazırkı dizayn və saxlanmamış dəyişikliklər bu redaktordan silinəcək.`)) return;
        ctx.resetCustomizationForm();
        s.customProductId=p.id; s.customEditingLineId=lineId;
        const source=productOrId&&typeof productOrId==="object"?productOrId:p;
        const savedContext=lineId?s.cart.find(item=>item.lineId===lineId)?.customization?.productContext:null;
        s.customProductContext={
            productId:p.id,
            categoryId:source.categoryId??source.category_id??savedContext?.categoryId??null,
            category:p.cat||"",
            variantId:source.variantId??source.variant_id??savedContext?.variantId??null,
            sku:source.sku??savedContext?.sku??null,
            size:p.size||"",
            image:p.image||(Array.isArray(p.images)&&p.images.length?p.images[0]:""),
            name:p.name||"",
            price:Number(p.price)||0
        };
        setProductSizeOptions(p);
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
                Promise.resolve().then(async()=>{
                    const legacyRestored=await ctx.restoreDraftUpload?.(p.id);
                    const imageRestored=await ctx.restoreDraftImages?.(p.id);
                    return [legacyRestored,imageRestored];
                }).then(([legacyRestored, imageRestored])=>{
                    if(String(s.customProductId)!==String(p.id)) return;
                    const restored = !!legacyRestored || !!imageRestored;
                    if(!restored&&draft.upload?.name){
                        document.getElementById("customImageName").textContent=`Faylı yenidən seçin: ${String(draft.upload.name).slice(0,120)}`;
                        showToast("Dizayn qaralaması bərpa edildi, amma əlavə fayl bərpa olunmadı. Faylı yenidən seçin.");
                    }
                    ctx.updateCustomizationPreview();
                }).catch(error=>console.warn("F1 design draft upload restore error",error));
            }
        }
        document.getElementById("customProductName").textContent=`${p.name} · ${money(p.price)}`;
        const productMeta=document.getElementById("designProductMeta");
        if(productMeta){
            const facts=[];
            if(p.material) facts.push(String(p.material));
            if(p.size) facts.push(`Məhsul ölçüsü: ${p.size}`);
            productMeta.textContent=facts.join(" · ");
        }
        const productReference=document.getElementById("designProductReference");
        const productThumb=document.getElementById("designProductThumb");
        const productReferenceName=document.getElementById("designProductReferenceName");
        const productImage=s.customProductContext.image;
        const productFallback=document.getElementById("designProductFallback");
        if(productReference&&productThumb&&productReferenceName){
            productReference.hidden=false;
            productReferenceName.textContent=p.name||"";
            productThumb.alt=`${p.name||"Məhsul"} nümunə şəkli`;
            productThumb.onload=()=>{productThumb.hidden=false;if(productFallback)productFallback.hidden=true;};
            productThumb.onerror=()=>{productThumb.hidden=true;if(productFallback)productFallback.hidden=false;};
            if(productImage){productThumb.src=productImage;}else{productThumb.removeAttribute("src");productThumb.hidden=true;if(productFallback)productFallback.hidden=false;}
        }
        document.getElementById("customSubmitBtn").textContent=lineId?"✅ Dəyişiklikləri yadda saxla":"🛒 Fərdiləşdir və səbətə əlavə et";
        if(lineId){
            const item=s.cart.find(i=>i.lineId===lineId), c=item?.customization;
            if(c){
                setProductSizeOptions(p,c.size||"");
                document.getElementById("customText").value=c.text||"";
                document.getElementById("customColor").value=c.color||"Qara";
                document.getElementById("customSize").value=c.size||"Standart";
                document.getElementById("customSizeValue").value=c.sizeValue||"";
                document.getElementById("customFont").value=c.font||"Klassik";
                s.customExistingImageName=c.imageName||"";
                s.customExistingImagePath=c.imagePath||"";
                const savedUploads=Array.isArray(c.uploads)?c.uploads.filter(upload=>upload&&typeof upload==="object").slice(0,9):[];
                s.customExistingUploads=savedUploads.length?savedUploads:(c.imagePath?[{layerId:"",purpose:c.imageType==="application/pdf"?"attachment":"image",name:c.imageName||"Yüklənmiş fayl",path:c.imagePath,type:c.imageType||"",size:Number(c.imageSize)||0}]:[]);
                s.customExistingImageUrl="";
                document.getElementById("customNote").value=c.note||"";
                document.getElementById("customImageName").textContent=c.imageName?`Seçilmiş fayl: ${c.imageName}`:"Fayl seçilməyib";
                const designColorMap={Qara:"#30251a",Ağ:"#ffffff",Qızılı:"#b88919",Gümüşü:"#8b9299",Digər:"#333333"};
                s.customDesignLayout=c.layout||{
                    version:3,
                    selected:"text",
                    order:["image","text"],
                    image:{x:150,y:120,scale:1,rotation:0,visible:!!(c.imageName||c.imagePath)},
                    text:{text:c.text||"",x:150,y:120,scale:1,rotation:0,font:c.font||"Klassik",color:designColorMap[c.color]||designColorMap.Qara,fontSize:28,align:"center",visible:!!String(c.text||"").trim()}
                };
                ctx.restoreDesignLayout?.(s.customDesignLayout);
            }
        }
        ctx.toggleCustomSizeValue();
        ctx.updateCustomizationPreview();
        ctx.syncDesignStudio?.();
        ctx.setDesignMode?.("product");
        if (lineId && s.customExistingUploads.length) {
            const legacyUploads = s.customExistingUploads.map(upload=>upload.layerId?upload:{...upload,layerId:studioImageLayerId(s.customDesignLayout)});
            ctx.loadExistingDesignUploadsIntoStudio?.(legacyUploads);
        } else if (s.customExistingImagePath && lineId) ctx.loadExistingDesignIntoStudio?.(s.customExistingImagePath);
        ["customText","customColor","customSize","customFont","customSizeValue"].forEach(id=>document.getElementById(id).oninput=updateCustomizationPreview);
        ["customColor","customSize","customFont"].forEach(id=>document.getElementById(id).onchange=updateCustomizationPreview);
        ctx.openDialog("customModal", ".ds-close");
        if(!wasOpen){
            document.body.classList.add("f1-custom-modal-open");
            if(!customHistoryToken && !customBackPending) customHistoryToken=pushCustomHistoryEntry();
        }
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
        // Design Studio owns validation, decoding and local draft persistence.
        // Keep this as the single delegated file-input entry point so one change
        // cannot create two object URLs or race two competing previews.
        if(typeof ctx.loadDesignFiles==="function") return ctx.loadDesignFiles(input.files);
        if(typeof ctx.loadDesignFile==="function") return ctx.loadDesignFile(file);
        return showToast("Şəkil redaktoru hazır deyil. Səhifəni yeniləyib yenidən cəhd edin.");
    }
    function updateCustomizationPreview(){
        const box=document.getElementById("customPreview");
        const text=document.getElementById("customText").value.trim();
        const color=document.getElementById("customColor").value;
        const font=document.getElementById("customFont").value;
        const file=ctx.getDesignUploadFile?.()||document.getElementById("customImage").files?.[0];
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
        const imageFiles=[...(ctx.getDesignUploadFiles?.().values?.()||[])];
        const attachment=ctx.getDesignAttachmentFile?.()||null;
        const file=attachment||imageFiles[0]||ctx.getDesignUploadFile?.()||document.getElementById("customImage").files?.[0];
        const layout=ctx.saveDesignLayout?.({silent:true})||s.customDesignLayout||null;
        const compositionText=Array.isArray(layout?.layers)
            ? layout.layers.filter(layer=>layer.type==="text"&&layer.visible!==false).map(layer=>String(layer.text||"").trim()).filter(Boolean).join(" · ").slice(0,500)
            : String(document.getElementById("customText").value||"").trim();
        return {
            productContext: {
                productId: Number(s.customProductContext?.productId || s.customProductId),
                categoryId: s.customProductContext?.categoryId ?? null,
                category: String(s.customProductContext?.category || "").slice(0,120),
                variantId: s.customProductContext?.variantId ?? null,
                sku: s.customProductContext?.sku ?? null
            },
            text:compositionText,
            color:document.getElementById("customColor").value,
            size:document.getElementById("customSize").value,
            sizeValue:document.getElementById("customSizeValue").value.trim(),
            font:document.getElementById("customFont").value,
            imageName:[...new Set([...imageFiles.map(item=>item.name),...(attachment?[attachment.name]:[]),...s.customExistingUploads.map(item=>item.name).filter(Boolean)])].join(", ").slice(0,180)||s.customExistingImageName||"",
            imagePath:s.customExistingImagePath||"",
            imageType:file?.type||"",
            imageSize:file?.size||0,
            uploads:s.customExistingUploads.slice(0,9),
            note:document.getElementById("customNote").value.trim(),
            layout,
            previewData:ctx.getDesignPreviewData?.()||""
        };
    }
    function customizationSignature(c){ return JSON.stringify(c||{}); }
    async function uploadCustomerDesign(file){
        if(!file) return null;
        const inspected=await inspectDesignFile(file);
        const normalized=normalizeDesignFile(file,inspected.type);
        const userData=await authService.getUser();
        const user=userData?.data?.user;
        if(!user) throw new Error("AUTH_REQUIRED");
        const extMap={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf"};
        const ext=extMap[inspected.type];
        if(!ext) throw new Error("DESIGN_FILE_TYPE");
        const token=globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():(()=>{
            const bytes=new Uint8Array(16);
            if(!globalThis.crypto?.getRandomValues) throw new Error("SECURE_RANDOM_UNAVAILABLE");
            globalThis.crypto.getRandomValues(bytes);
            bytes[6]=(bytes[6]&0x0f)|0x40; bytes[8]=(bytes[8]&0x3f)|0x80;
            const h=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
            return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
        })();
        const path=`orders/${user.id}/${token}.${ext}`;
        return storageService.uploadCustomerDesign(path, normalized);
    }
    async function confirmCustomization(){
        const p=ctx.getProduct(s.customProductId); if(!p) return;
        const submit=document.getElementById("customSubmitBtn");
        if(submit?.disabled) return;
        const customization=ctx.getCustomizationFormData();
        const unfilledTemplateText=customization.layout?.layers?.some(layer=>layer?.type==="text"&&layer.visible!==false&&layer.requiresInput===true);
        if(unfilledTemplateText) return showToast("Şablondakı nümunə mətnləri öz məlumatınızla əvəz edin və ya həmin qatları silin.");
        const invalidQr=customization.layout?.layers?.some(layer=>layer?.type==="qr"&&layer.visible!==false&&!ctx.isDesignQrRenderable?.(layer.content));
        if(invalidQr) return showToast("QR kod üçün etibarlı, qısa link və ya mətn daxil edin.");
        const hasVisibleLayer=customization.layout?.layers?.some(layer=>layer?.visible!==false&&(
            (layer.type==="text"&&String(layer.text||"").trim())||
            (layer.type==="image"&&(customization.imageName||customization.imagePath))||
            ["ornament","shape","background"].includes(layer.type)||
            (layer.type==="qr"&&String(layer.content||"").trim())
        ));
        if(!customization.text && !customization.imageName && !customization.note && !hasVisibleLayer){
            return showToast("Fərdi sifariş üçün ən azı yazı, şəkil və ya əlavə qeyd daxil edin.");
        }
        if([1,2].includes(Number(p.id)) && !customization.text){
            return showToast("Lipa nömrə üçün üzərinə yazılacaq mətn və ya nömrəni daxil edin.");
        }
        if(customization.size==="Xüsusi ölçü" && !customization.sizeValue){
            return showToast("Xüsusi ölçü seçmisiniz — ölçünü də yazın.");
        }
        const pendingImages=ctx.getDesignUploadFiles?.()||new Map();
        const attachment=ctx.getDesignAttachmentFile?.()||null;
        const selectedFiles=[...new Set([...pendingImages.values(),...(attachment?[attachment]:[])])];
        if(p.stockQuantity!=null){
            const currentQty=s.cart.filter(i=>i.id===p.id && i.lineId!==s.customEditingLineId).reduce((sum,i)=>sum+(Number(i.qty)||0),0);
            const reservedForEdit=s.customEditingLineId?Number(s.cart.find(i=>i.lineId===s.customEditingLineId)?.qty||0):0;
            if(Number(p.stockQuantity)<=0) return showToast("Bu məhsul hazırda stokda yoxdur.");
            if(currentQty+Math.max(1,reservedForEdit)>Number(p.stockQuantity)) return showToast("Bu məhsul üçün stok limiti dolub.");
        }
        const oldText=submit?.textContent;
        const fileStatus=document.getElementById("customImageName");
        const newlyUploadedPaths=[];
        try{
            if(submit){submit.disabled=true;submit.textContent=selectedFiles.length?"⏳ Fayllar şəxsi yaddaşa yüklənir...":"⏳ Yadda saxlanır...";}
            const existingUploads=s.customExistingUploads.slice(0,9);
            const imageLayers=(customization.layout?.layers||[]).filter(layer=>layer.type==="image").slice(0,8);
            const retainedUploads=[];
            let uploadedCount=0;
            const storedByFile=new Map();
            for(const layer of imageLayers){
                const pending=pendingImages.get(layer.id);
                if(pending){
                    let stored=storedByFile.get(pending);
                    if(!stored){
                        uploadedCount++;
                        if(fileStatus) fileStatus.textContent=`Şəxsi Storage-a yüklənir: ${uploadedCount}/${selectedFiles.length} · ${pending.name}`;
                        stored=await ctx.uploadCustomerDesign(pending);
                        newlyUploadedPaths.push(stored.path);
                        storedByFile.set(pending,stored);
                    }
                    retainedUploads.push({layerId:layer.id,purpose:"image",...stored});
                    continue;
                }
                const old=existingUploads.find(upload=>upload.purpose==="image"&&(upload.layerId===layer.id||upload.layerId===layer.sourceLayerId||!upload.layerId));
                if(old) retainedUploads.push({...old,layerId:layer.id,purpose:"image"});
            }
            const previousAttachment=existingUploads.find(upload=>upload.purpose==="attachment");
            if(attachment){
                uploadedCount++;
                if(fileStatus) fileStatus.textContent=`Şəxsi Storage-a yüklənir: ${uploadedCount}/${selectedFiles.length} · ${attachment.name}`;
                const stored=await ctx.uploadCustomerDesign(attachment);
                newlyUploadedPaths.push(stored.path);
                retainedUploads.push({layerId:"",purpose:"attachment",...stored});
            }else if(previousAttachment){
                retainedUploads.push(previousAttachment);
            }
            customization.uploads=retainedUploads.slice(0,9);
            const primary=retainedUploads.find(upload=>upload.purpose==="image")||retainedUploads[0]||null;
            customization.imageName=retainedUploads.map(upload=>upload.name).filter(Boolean).join(", ").slice(0,180);
            customization.imagePath=primary?.path||"";
            customization.imageType=primary?.type||"";
            customization.imageSize=primary?.size||0;
            if(fileStatus&&retainedUploads.length) fileStatus.textContent=`Şəxsi Storage-da ${retainedUploads.length} fayl saxlanıldı.`;
            if(s.customEditingLineId){
                const item=s.cart.find(i=>i.lineId===s.customEditingLineId);
                if(item){
                    const previousPaths=[item.customization?.imagePath,...(item.customization?.uploads||[]).map(upload=>upload?.path)].filter(Boolean);
                    const retainedPaths=new Set(retainedUploads.map(upload=>upload.path));
                    item.customization=customization;
                    ctx.saveCart(); ctx.renderCart(); ctx.closeCustomModal();
                    const obsolete=[...new Set(previousPaths)].filter(path=>!retainedPaths.has(path));
                    if(obsolete.length) storageService.removeCustomerDesigns(obsolete).catch(()=>{});
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
            if(newlyUploadedPaths.length) storageService.removeCustomerDesigns(newlyUploadedPaths).catch(()=>{});
            const raw=String(e?.message||e||"");
            const map={
                DESIGN_FILE_TYPE:"Dizayn faylı yalnız PNG, JPG, WEBP və ya PDF ola bilər.",
                DESIGN_FILE_TOO_LARGE:"Dizayn faylı maksimum 10 MB ola bilər.",
                DESIGN_FILE_DIMENSIONS:"Şəklin ölçüsü emal limiti üçün həddən artıq böyükdür.",
                DESIGN_FILE_MALFORMED:"Fayl zədələnib və ya düzgün şəkil/PDF formatı deyil.",
                AUTH_REQUIRED:"Dizayn faylı yükləmək üçün əvvəlcə hesabınıza daxil olun.",
                DESIGN_UPLOAD_FAILED:"Fayllardan biri şəxsi yaddaşa yüklənmədi. Dizaynınız saxlanılıb; yenidən cəhd edə bilərsiniz.",
                SECURE_RANDOM_UNAVAILABLE:"Bu brauzerdə təhlükəsiz fayl yükləməsi mümkün deyil. HTTPS səhifəsində yenidən cəhd edin."
            };
            const friendly=map[raw] || (raw.startsWith("DESIGN_UPLOAD_FAILED:") ? `Dizayn yüklənmədi: ${raw.replace("DESIGN_UPLOAD_FAILED: ","")}` : "Fərdi sifariş yadda saxlanmadı.");
            if(fileStatus&&selectedFiles.length) fileStatus.textContent=`Yükləmə alınmadı; ${selectedFiles.length} fayl yalnız bu cihazdadır. Mövcud dizaynınız qorunub.`;
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
