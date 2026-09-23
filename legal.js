import { state as s, ctx } from './state.js';
import { openDialog, closeDialog } from './modal.js';
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
