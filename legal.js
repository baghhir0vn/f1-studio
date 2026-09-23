import { state as s, ctx } from './state.js?v=59.2';
import { openDialog, closeDialog } from './modal.js?v=59.2';
export function initLegal() {
    function openLegal(type){
        const map={privacy:"privacyModal",terms:"termsModal",returns:"returnsModal"};
        const id=map[type]; if(!id) return;
        ctx.openDialog(id, `#${type}Title`);
    }
    function closeLegal(type){
        const map={privacy:"privacyModal",terms:"termsModal",returns:"returnsModal"};
        const id=map[type]; if(!id) return;
        ctx.closeDialog(id);
    }
    Object.assign(ctx, {
    openLegal,
    closeLegal
    });
}
