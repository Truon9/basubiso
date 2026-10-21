import { API_BASE_URL } from '../../core/config.js';
import { authorizedFetch } from '../../core/auth.js';
import { applyTheme, toggleTheme } from '../../core/preferences.js';
const learningStyles=document.createElement('link');learningStyles.rel='stylesheet';learningStyles.href='src/features/learning/learning.css';document.head.append(learningStyles);

const copy = {
  en: { subjects:'Subjects', createSubject:'+ Create subject', workspace:'Learning workspace', mySubjects:'Your subjects', startTitle:'Start with a subject', startText:'Create a subject, then add a PDF to turn it into flashcards and practice questions.', addDocumentHint:'Add a document to create an AI study set.', addPdf:'+ Add PDF', newSubject:'NEW SUBJECT', nameSubject:'Name your subject', create:'Create subject', documents:'documents', courseDocuments:'Documents', study:'Study', delete:'Delete', deleteDocument:'Delete document?', deleteDocumentWarning:'This document and its generated flashcards and quiz will be permanently deleted.', deleteDocumentAction:'Delete document', deleting:'Deleting...', documentDeleted:'Document deleted.', cancel:'Cancel', noDocuments:'No documents yet. Add your first PDF to begin.', processing:'Reading your PDF and creating your study set...', saved:'Study set saved.', noQuestions:'No quiz questions were created.', error:'Unable to complete the request.', signIn:'Sign in', welcome:'Welcome back to MayStudy, your learning workspace.', username:'Username', password:'Password', storyEyebrow:'YOUR STUDY COMPANION', storyLine1:'Every document,', storyEmphasis:'understood', storyLine2:'in one place.', storyDescription:'Turn your course PDFs into focused flashcards, concise notes, and practice questions.', pdfIntelligence:'PDF intelligence', flashcards:'Flashcards', practice:'Practice', studyMaterials:'Study materials from your documents', alwaysAvailable:'Learning sets always available', quote:'“Small steps, repeated often, turn knowledge into confidence.”', quiz:'Quiz' },
  vi: { subjects:'Môn học', createSubject:'+ Tạo môn học', workspace:'Không gian học tập', mySubjects:'Môn học của bạn', startTitle:'Bắt đầu với một môn học', startText:'Tạo môn học, sau đó thêm PDF để biến tài liệu thành flashcard và câu hỏi luyện tập.', addDocumentHint:'Thêm tài liệu để tạo bộ học bằng AI.', addPdf:'+ Thêm PDF', newSubject:'MÔN HỌC MỚI', nameSubject:'Đặt tên môn học', create:'Tạo môn học', documents:'tài liệu', courseDocuments:'Tài liệu', study:'Học', delete:'Xoá', deleteDocument:'Xoá tài liệu?', deleteDocumentWarning:'Tài liệu này cùng flashcard và câu hỏi đã tạo sẽ bị xoá vĩnh viễn.', deleteDocumentAction:'Xoá tài liệu', deleting:'Đang xoá...', documentDeleted:'Đã xoá tài liệu.', cancel:'Huỷ', noDocuments:'Chưa có tài liệu. Thêm PDF đầu tiên để bắt đầu.', processing:'Đang đọc PDF và tạo bộ học...', saved:'Đã lưu bộ học.', noQuestions:'Chưa tạo được câu hỏi trắc nghiệm.', error:'Không thể hoàn tất yêu cầu.', signIn:'Đăng nhập', welcome:'Chào mừng bạn trở lại MayStudy, không gian học tập của bạn.', username:'Tên đăng nhập', password:'Mật khẩu', storyEyebrow:'BẠN ĐỒNG HÀNH HỌC TẬP', storyLine1:'Mọi tài liệu,', storyEmphasis:'đều dễ hiểu', storyLine2:'trong một nơi.', storyDescription:'Biến tài liệu PDF của bạn thành flashcard cô đọng, ghi chú súc tích và câu hỏi luyện tập.', pdfIntelligence:'Hiểu tài liệu PDF', flashcards:'Flashcard', practice:'Luyện tập', studyMaterials:'Học liệu từ chính tài liệu của bạn', alwaysAvailable:'Bộ học luôn sẵn sàng', quote:'“Từng bước nhỏ, lặp lại mỗi ngày, sẽ biến kiến thức thành sự tự tin.”', quiz:'Trắc nghiệm' }
};
const courseCopy = {
  en: { rename:'Rename', renameSubject:'Rename subject', deleteSubject:'Delete subject', deleteSubjectQuestion:'Delete this subject?', deleteSubjectWarning:'All documents in this subject, including their flashcards and quizzes, will be permanently deleted.', subjectSettings:'SUBJECT SETTINGS', subjectName:'Subject name', saveChanges:'Save changes', saving:'Saving...', renamed:'Subject renamed.', subjectDeleted:'Subject deleted.', subjectNameRequired:'Enter a subject name.' },
  vi: { rename:'Đổi tên', renameSubject:'Đổi tên môn học', deleteSubject:'Xoá môn học', deleteSubjectQuestion:'Xoá môn học này?', deleteSubjectWarning:'Toàn bộ tài liệu trong môn học, gồm flashcard và câu hỏi, sẽ bị xoá vĩnh viễn.', subjectSettings:'CÀI ĐẶT MÔN HỌC', subjectName:'Tên môn học', saveChanges:'Lưu thay đổi', saving:'Đang lưu...', renamed:'Đã đổi tên môn học.', subjectDeleted:'Đã xoá môn học.', subjectNameRequired:'Hãy nhập tên môn học.' }
};
const $ = s => document.querySelector(s); const state = { language:localStorage.getItem('n-learny-language') || 'en', courses:[], course:null, document:null, card:0, quiz:0, quizAnswers:[] };
const t = key => copy[state.language][key] ?? courseCopy[state.language][key];
const studyCopy = {
  en: { refresh:'Generate a new study set', refreshing:'Generating 20 new questions and 10 flashcards...', refreshed:'New study set saved.', legacy:'Upload this PDF again to enable refresh.', previous:'Previous question', next:'Next question', question:'Question', noCards:'No flashcards were created.' },
  vi: { refresh:'Tạo lại bộ học mới', refreshing:'Đang tạo 20 câu hỏi và 10 flashcard mới...', refreshed:'Đã lưu bộ học mới.', legacy:'Hãy tải lại PDF này để bật tính năng tạo lại.', previous:'Câu trước', next:'Câu tiếp', question:'Câu hỏi', noCards:'Chưa tạo được flashcard.' }
};
const st = key => studyCopy[state.language][key];
let pendingDelete = null;
let pendingRenameCourse = null;
let pendingDeleteCourse = null;
const toast = text => { $('#toast').textContent=text; $('#toast').classList.add('show'); setTimeout(()=>$('#toast').classList.remove('show'),4500); };
const request = async (path, options={}) => { const res=await authorizedFetch(`${API_BASE_URL}${path}`,options); const data=res.status===204?null:await res.json(); if(!res.ok) throw new Error(data?.detail||t('error')); return data; };
function applyLanguage() {
  document.documentElement.lang = state.language;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const input = el.querySelector('input');
    if (input) el.firstChild.textContent = t(el.dataset.i18n);
    else el.textContent = t(el.dataset.i18n);
  });
  $('#language').textContent = state.language.toUpperCase();
  $('#title').textContent = state.course?.name || t('mySubjects');
  $('#crumb').textContent = state.course ? t('subjects') : t('workspace');
  $('#course-name').textContent = t('courseDocuments');
  const refresh = $('#refresh-study');
  refresh.setAttribute('aria-label', st('refresh'));
  refresh.title = state.document && !state.document.can_refresh ? st('legacy') : st('refresh');
  $('#refresh-unavailable').textContent = st('legacy');
  $('#quiz-prev').setAttribute('aria-label', st('previous'));
  $('#quiz-next').setAttribute('aria-label', st('next'));
  renderCourses();
  if (state.course) renderDocuments();
  if (state.document) { renderCard(); renderQuiz(); }
  document.dispatchEvent(new CustomEvent('maystudy:language-changed', { detail: { language: state.language } }));
}

function renderCourses() {
  const list = $('#courses');
  const nav = $('#course-nav');
  list.replaceChildren();
  nav.replaceChildren();
  $('#empty').hidden = Boolean(state.course) || state.courses.length > 0;
  list.hidden = Boolean(state.course) || state.courses.length === 0;
  $('#course-detail').hidden = !state.course;
  document.dispatchEvent(new CustomEvent('maystudy:course-changed', { detail: { courseId: state.course?.id ?? null, courseName: state.course?.name ?? null } }));

  state.courses.forEach(c => {
    const card = document.createElement('article');
    card.className = 'course';
    const top = document.createElement('div');
    top.className = 'course-top';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.textContent = c.name.charAt(0).toUpperCase();
    const actions = document.createElement('div');
    actions.className = 'course-actions';
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.textContent = t('rename');
    rename.setAttribute('aria-label', `${t('renameSubject')}: ${c.name}`);
    rename.onclick = () => openRenameCourse(c);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = t('delete');
    remove.setAttribute('aria-label', `${t('deleteSubject')}: ${c.name}`);
    remove.onclick = () => openDeleteCourse(c);
    actions.append(rename, remove);
    top.append(dot, actions);
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'course-open';
    const name = document.createElement('h3');
    name.textContent = c.name;
    const count = document.createElement('p');
    count.textContent = `${c.document_count} ${t('documents')}`;
    open.append(name, count);
    open.onclick = () => openCourse(c.id);
    card.append(top, open);
    list.append(card);

    const navButton = document.createElement('button');
    navButton.textContent = c.name;
    navButton.onclick = () => openCourse(c.id);
    nav.append(navButton);
  });
}
async function loadCourses(){state.courses=await request('/courses');renderCourses();}
async function openCourse(id){state.course=await request(`/courses/${id}`);$('#title').textContent=state.course.name;$('#crumb').textContent=t('subjects');$('#course-name').textContent=t('courseDocuments');renderCourses();renderDocuments();}

function openRenameCourse(course) {
  pendingRenameCourse = { id: course.id, name: course.name };
  $('#rename-course-input').value = course.name;
  $('#rename-course-dialog').showModal();
  $('#rename-course-input').focus();
  $('#rename-course-input').select();
}

async function renameCourse(event) {
  event.preventDefault();
  if (!pendingRenameCourse || $('#save-rename-course').disabled) return;
  const name = $('#rename-course-input').value.trim();
  if (!name) {
    toast(t('subjectNameRequired'));
    $('#rename-course-input').focus();
    return;
  }
  const save = $('#save-rename-course');
  const cancel = $('#cancel-rename-course');
  const close = $('#close-rename-course');
  save.disabled = cancel.disabled = close.disabled = true;
  save.textContent = t('saving');
  try {
    const updated = await request(`/courses/${pendingRenameCourse.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    state.courses = state.courses.map(course => course.id === updated.id ? { ...course, name: updated.name } : course);
    if (state.course?.id === updated.id) state.course.name = updated.name;
    $('#rename-course-dialog').close();
    applyLanguage();
    toast(t('renamed'));
  } catch (error) {
    toast(error.message);
  } finally {
    save.disabled = cancel.disabled = close.disabled = false;
    save.textContent = t('saveChanges');
  }
}

function openDeleteCourse(course) {
  pendingDeleteCourse = { id: course.id, name: course.name };
  $('#delete-course-name').textContent = course.name;
  $('#delete-course-dialog').showModal();
}

async function deleteCourse() {
  if (!pendingDeleteCourse || $('#confirm-delete-course').disabled) return;
  const courseId = pendingDeleteCourse.id;
  const confirm = $('#confirm-delete-course');
  const cancel = $('#cancel-delete-course');
  confirm.disabled = cancel.disabled = true;
  confirm.textContent = t('deleting');
  try {
    await request(`/courses/${courseId}`, { method: 'DELETE' });
    state.courses = state.courses.filter(course => course.id !== courseId);
    if (state.course?.id === courseId) {
      state.course = null;
      state.document = null;
    }
    $('#delete-course-dialog').close();
    applyLanguage();
    toast(t('subjectDeleted'));
  } catch (error) {
    toast(error.message);
  } finally {
    confirm.disabled = cancel.disabled = false;
    confirm.textContent = t('deleteSubject');
  }
}

function renderDocuments() {
  const list = $('#documents');
  list.replaceChildren();
  if (!state.course) return;

  if (!state.course.documents.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-doc';
    empty.textContent = t('noDocuments');
    list.append(empty);
    return;
  }

  state.course.documents.forEach(documentItem => {
    const row = document.createElement('article');
    row.className = 'document';

    const icon = document.createElement('span');
    icon.className = 'document-icon';
    icon.textContent = 'PDF';

    const info = document.createElement('div');
    info.className = 'document-info';
    const filename = document.createElement('strong');
    filename.textContent = documentItem.filename;
    const counts = document.createElement('p');
    counts.textContent = `${documentItem.flashcards.length} flashcards · ${documentItem.questions.length} quiz`;
    info.append(filename, counts);

    const actions = document.createElement('div');
    actions.className = 'document-actions';
    const studyButton = document.createElement('button');
    studyButton.type = 'button';
    studyButton.className = 'primary';
    studyButton.textContent = t('study');
    studyButton.onclick = () => study(documentItem);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'document-delete';
    deleteButton.textContent = t('delete');
    deleteButton.setAttribute('aria-label', `${t('delete')}: ${documentItem.filename}`);
    deleteButton.onclick = () => {
      pendingDelete = documentItem;
      $('#delete-document-name').textContent = documentItem.filename;
      $('#delete-document-dialog').showModal();
    };

    actions.append(studyButton, deleteButton);
    row.append(icon, info, actions);
    list.append(row);
  });
}

async function deleteDocument() {
  if (!pendingDelete || !state.course) return;
  const { id } = pendingDelete;
  const courseId = state.course.id;
  const confirmButton = $('#confirm-delete');
  const cancelButton = $('#cancel-delete');
  confirmButton.disabled = true;
  cancelButton.disabled = true;
  confirmButton.textContent = t('deleting');

  try {
    await request(`/courses/${courseId}/documents/${id}`, { method: 'DELETE' });
    if (state.course?.id === courseId) {
      state.course.documents = state.course.documents.filter(item => item.id !== id);
      renderDocuments();
    }
    if (state.document?.id === id) state.document = null;
    $('#delete-document-dialog').close();
    pendingDelete = null;
    toast(t('documentDeleted'));
    loadCourses().catch(error => toast(error.message));
  } catch (error) {
    toast(error.message);
  } finally {
    confirmButton.disabled = false;
    cancelButton.disabled = false;
    confirmButton.textContent = t('deleteDocumentAction');
  }
}
async function study(d){
  if (!state.course) return;
  const courseId=state.course.id;
  let latest;
  try {
    const course=await request(`/courses/${courseId}`);
    if (state.course?.id!==courseId) return;
    state.course=course;
    latest=course.documents.find(item=>item.id===d.id);
    renderDocuments();
    if (!latest) { toast(t('error')); return; }
  } catch (error) {
    toast(error.message);
    return;
  }
  state.document=latest;
  state.card=0;
  state.quiz=0;
  state.quizAnswers=[];
  $('#study-source').textContent=latest.filename;
  $('#refresh-study').disabled=!latest.can_refresh;
  $('#refresh-study').title=latest.can_refresh?st('refresh'):st('legacy');
  $('#refresh-unavailable').hidden=Boolean(latest.can_refresh);
  $('#refresh-unavailable').textContent=st('legacy');
  renderCard();
  renderQuiz();
  $('#study-dialog').showModal();
}
function renderCard(){
  if (!state.document) return;
  const cards=state.document.flashcards;
  $('#card').disabled=!cards.length;
  $('#prev').disabled=!cards.length;
  $('#next').disabled=!cards.length;
  if(!cards.length){$('#card-count').textContent='0 / 0';$('#front').textContent=st('noCards');$('#back').textContent='';return;}
  const card=cards[state.card];
  $('#card-count').textContent=`${state.card+1} / ${cards.length}`;
  $('#front').textContent=card.front;
  $('#back').textContent=card.back;
  $('#card').classList.remove('flipped');
}
function renderQuiz(){
  if (!state.document) return;
  const questions=state.document.questions;
  const q=questions[state.quiz];
  const answers=$('#answers');
  answers.replaceChildren();
  $('#quiz-count').textContent=`${st('question')} ${q?state.quiz+1:0} / ${questions.length}`;
  $('#quiz-prev').disabled=state.quiz===0;
  $('#quiz-next').disabled=state.quiz>=questions.length-1;
  $('#feedback').textContent='';
  if(!q){$('#question').textContent=t('noQuestions');return;}
  $('#question').textContent=q.question;
  const selected=state.quizAnswers[state.quiz];
  q.options.forEach((option,index)=>{
    const button=document.createElement('button');
    button.type='button';
    button.textContent=`${String.fromCharCode(65+index)}. ${option}`;
    if(selected!==undefined){
      button.disabled=true;
      if(index===q.answer_index) button.classList.add('right');
      else if(index===selected) button.classList.add('wrong');
    }
    button.onclick=()=>{state.quizAnswers[state.quiz]=index;renderQuiz();};
    answers.append(button);
  });
  if(selected!==undefined) $('#feedback').textContent=q.explanation;
}
async function refreshStudy(){
  const current=state.document;
  if(!current || !state.course || !current.can_refresh){toast(st('legacy'));return;}
  const courseId=state.course.id;
  const button=$('#refresh-study');
  button.disabled=true;
  button.classList.add('loading');
  toast(st('refreshing'));
  try{
    const updated=await request(`/courses/${courseId}/documents/${current.id}:refresh`,{method:'POST'});
    if(state.document?.id!==current.id || state.course?.id!==courseId)return;
    state.document=updated;
    state.course.documents=state.course.documents.map(item=>item.id===updated.id?updated:item);
    state.card=0;
    state.quiz=0;
    state.quizAnswers=[];
    renderDocuments();
    renderCard();
    renderQuiz();
    toast(st('refreshed'));
  }catch(error){toast(error.message);}finally{button.classList.remove('loading');button.disabled=!state.document?.can_refresh;}
}
async function createCourse(){const name=$('#course-input').value.trim();if(!name)return;try{const c=await request('/courses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});$('#course-dialog').close();$('#course-form').reset();state.course=null;await loadCourses();openCourse(c.id);}catch(e){toast(e.message);}}
async function upload(e){const file=e.target.files[0];if(!file||!state.course)return;const body=new FormData();body.append('file',file);toast(t('processing'));try{await request(`/courses/${state.course.id}/documents:generate`,{method:'POST',body});toast(t('saved'));await openCourse(state.course.id);}catch(error){toast(error.message);}finally{e.target.value='';}}
$('#new-course').onclick=$('#empty-new').onclick=()=>$('#course-dialog').showModal();
$('#course-form').onsubmit=e=>{e.preventDefault();createCourse();};
$('#close-course-dialog').onclick=()=>$('#course-dialog').close();
$('#course-dialog').addEventListener('close', ()=>$('#course-form').reset());
$('#rename-course').onclick=()=>{if(state.course)openRenameCourse(state.course);};
$('#delete-course').onclick=()=>{if(state.course)openDeleteCourse(state.course);};
$('#rename-course-form').onsubmit=renameCourse;
$('#cancel-rename-course').onclick=$('#close-rename-course').onclick=()=>$('#rename-course-dialog').close();
$('#rename-course-dialog').addEventListener('cancel', event=>{if($('#save-rename-course').disabled)event.preventDefault();});
$('#rename-course-dialog').addEventListener('close', ()=>{pendingRenameCourse=null;});
$('#confirm-delete-course').onclick=deleteCourse;
$('#cancel-delete-course').onclick=()=>$('#delete-course-dialog').close();
$('#delete-course-dialog').addEventListener('cancel', event=>{if($('#confirm-delete-course').disabled)event.preventDefault();});
$('#delete-course-dialog').addEventListener('close', ()=>{pendingDeleteCourse=null;});
$('#home').onclick=()=>{state.course=null;applyLanguage();};
$('.brand').onclick=e=>{e.preventDefault();$('#home').click();};
$('#file').onchange=upload;
$('#card').onclick=()=>$('#card').classList.toggle('flipped');
$('#prev').onclick=()=>{state.card=(state.card+state.document.flashcards.length-1)%state.document.flashcards.length;renderCard();};
$('#next').onclick=()=>{state.card=(state.card+1)%state.document.flashcards.length;renderCard();};
$('#quiz-prev').onclick=()=>{if(state.quiz>0){state.quiz--;renderQuiz();}};
$('#quiz-next').onclick=()=>{if(state.quiz<state.document.questions.length-1){state.quiz++;renderQuiz();}};
$('#refresh-study').onclick=refreshStudy;
$('#close-study').onclick=()=>$('#study-dialog').close();
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  $('#cards-panel').hidden=b.dataset.tab!=='cards';
  $('#quiz-panel').hidden=b.dataset.tab!=='quiz';
});
$('#language').onclick=()=>{state.language=state.language==='en'?'vi':'en';localStorage.setItem('n-learny-language',state.language);applyLanguage();};
$('#theme').onclick=toggleTheme;

$('#confirm-delete').onclick = deleteDocument;
$('#cancel-delete').onclick = () => $('#delete-document-dialog').close();
$('#delete-document-dialog').addEventListener('cancel', event => {
  if ($('#confirm-delete').disabled) event.preventDefault();
});
$('#delete-document-dialog').addEventListener('close', () => { pendingDelete = null; });

let learningLoaded = false;
async function initializeLearning() {
  if (learningLoaded) return;
  learningLoaded = true;
  try {
    await loadCourses();
  } catch (error) {
    learningLoaded = false;
    toast(error.message);
  }
}

document.addEventListener('n-learny:authenticated', initializeLearning);
document.addEventListener('n-learny:signed-out', () => {
  learningLoaded = false;
  state.courses = [];
  state.course = null;
  state.document = null;
  pendingRenameCourse = null;
  pendingDeleteCourse = null;
  $('#title').textContent = t('mySubjects');
  $('#crumb').textContent = t('workspace');
  renderCourses();
});
applyTheme();
applyLanguage();
