export function setupAuthPicker(root){
 const picker=root.querySelector('#auth-picker'),form=root.querySelector('#hevy-login-form'),social=root.querySelector('#social-connection');
 const choices=[...root.querySelectorAll('.auth-choice')],replacements=[...root.querySelectorAll('.auth-replacement')];
 const back=root.querySelector('#auth-back'),note=root.querySelector('#auth-note');
 function mode(next,provider){
  picker.dataset.mode=next;form.hidden=next==='social';social.hidden=next!=='social';back.hidden=next==='choose';
  choices.forEach(button=>button.inert=next!=='choose');
  replacements.forEach(element=>{element.inert=next!=='email';element.setAttribute('aria-hidden',String(next!=='email'));});
  root.querySelector('#hevy-password').value='';
  root.querySelector('#connect-status').textContent='';
  note.hidden=next==='social';note.textContent=next==='email'?'Use your Hevy password. It isn’t saved.':'Google and Apple use a workout import for now.';
  if(next==='email')root.querySelector('#hevy-username').focus({preventScroll:true});
  if(next==='social')root.querySelector('#social-title').textContent=provider;
 }
 root.querySelector('#choose-email').onclick=()=>mode('email');
 root.querySelector('#choose-google').onclick=()=>mode('social','Google');
 root.querySelector('#choose-apple').onclick=()=>mode('social','Apple');
 root.querySelector('#social-import').onclick=()=>root.querySelector('#connect-file').click();
 back.onclick=()=>{mode('choose');root.querySelector('#choose-email').focus({preventScroll:true});};
 mode('choose');
}
