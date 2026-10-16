import { API_BASE_URL } from '../../core/config.js';
import { applyTheme, toggleTheme } from '../../core/preferences.js';
const learningStyles=document.createElement('link');learningStyles.rel='stylesheet';learningStyles.href='src/features/learning/learning.css';document.head.append(learningStyles);

const copy = {
  en: { subjects:'Subjects', createSubject:'+ Create subject', workspace:'Learning workspace', mySubjects:'Your subjects', startTitle:'Start with a subject', startText:'Create a subject, then add a PDF to turn it into flashcards and practice questions.', addDocumentHint:'Add a document to create an AI study set.', addPdf:'+ Add PDF', newSubject:'NEW SUBJECT', nameSubject:'Name your subject', create:'Create subject', documents:'documents', courseDocuments:'Documents', study:'Study', delete:'Delete', deleteDocument:'Delete document?', deleteDocumentWarning:'This document and its generated flashcards and quiz will be permanently deleted.', deleteDocumentAction:'Delete document', deleting:'Deleting...', documentDeleted:'Document deleted.', cancel:'Cancel', noDocuments:'No documents yet. Add your first PDF to begin.', processing:'Reading your PDF and creating your study set...', saved:'Study set saved.', noQuestions:'No quiz questions were created.', error:'Unable to complete the request.', signIn:'Sign in', welcome:'Welcome back to MayStudy, your learning workspace.', username:'Username', password:'Password', storyEyebrow:'YOUR STUDY COMPANION', storyLine1:'Every document,', storyEmphasis:'understood', storyLine2:'in one place.', storyDescription:'Turn your course PDFs into focused flashcards, concise notes, and practice questions.', pdfIntelligence:'PDF intelligence', flashcards:'Flashcards', practice:'Practice', studyMaterials:'Study materials from your documents', alwaysAvailable:'Learning sets always available', quote:'“Small steps, repeated often, turn knowledge into confidence.”', quiz:'Quiz' },
  vi: { subjects:'Môn học', createSubject:'+ Tạo môn học', workspace:'Không gian học tập', mySubjects:'Môn học của bạn', startTitle:'Bắt đầu với một môn học', startText:'Tạo môn học, sau đó thêm PDF để biến tài liệu thành flashcard và câu hỏi luyện tập.', addDocumentHint:'Thêm tài liệu để tạo bộ học bằng AI.', addPdf:'+ Thêm PDF', newSubject:'MÔN HỌC MỚI', nameSubject:'Đặt tên môn học', create:'Tạo môn học', documents:'tài liệu', courseDocuments:'Tài liệu', study:'Học', delete:'Xoá', deleteDocument:'Xoá tài liệu?', deleteDocumentWarning:'Tài liệu này cùng flashcard và câu hỏi đã tạo sẽ bị xoá vĩnh viễn.', deleteDocumentAction:'Xoá tài liệu', deleting:'Đang xoá...', documentDeleted:'Đã xoá tài liệu.', cancel:'Huỷ', noDocuments:'Chưa có tài liệu. Thêm PDF đầu tiên để bắt đầu.', processing:'Đang đọc PDF và tạo bộ học...', saved:'Đã lưu bộ học.', noQuestions:'Chưa tạo được câu hỏi trắc nghiệm.', error:'Không thể hoàn tất yêu cầu.', signIn:'Đăng nhập', welcome:'Chào mừng bạn trở lại MayStudy, không gian học tập của bạn.', username:'Tên đăng nhập', password:'Mật khẩu', storyEyebrow:'BẠN ĐỒNG HÀNH HỌC TẬP', storyLine1:'Mọi tài liệu,', storyEmphasis:'đều dễ hiểu', storyLine2:'trong một nơi.', storyDescription:'Biến tài liệu PDF của bạn thành flashcard cô đọng, ghi chú súc tích và câu hỏi luyện tập.', pdfIntelligence:'Hiểu tài liệu PDF', flashcards:'Flashcard', practice:'Luyện tập', studyMaterials:'Học liệu từ chính tài liệu của bạn', alwaysAvailable:'Bộ học luôn sẵn sàng', quote:'“Từng bước nhỏ, lặp lại mỗi ngày, sẽ biến kiến thức thành sự tự tin.”', quiz:'Trắc nghiệm' }
};
const $ = s => document.querySelector(s); const state = { language:localStorage.getItem('n-learny-language') || 'en', courses:[], course:null, document:null, card:0 };
const t = key => copy[state.language][key];
let pendingDelete = null;
const toast = text => { $('#toast').textContent=text; $('#toast').classList.add('show'); setTimeout(()=>$('#toast').classList.remove('show'),4500); };
const request = async (path, options={}) => { const res=await fetch(`${API_BASE_URL}${path}`,options); const data=res.status===204?null:await res.json(); if(!res.ok) throw new Error(data?.detail||t('error')); return data; };
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
  renderCourses();
  if (state.course) renderDocuments();
}

function renderCourses() {
  const list = $('#courses');
  const nav = $('#course-nav');
  list.replaceChildren();
  nav.replaceChildren();
  $('#empty').hidden = Boolean(state.course) || state.courses.length > 0;
  list.hidden = Boolean(state.course) || state.courses.length === 0;
  $('#course-detail').hidden = !state.course;

  state.courses.forEach(c => {
    const card = document.createElement('article');
    card.className = 'course';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.textContent = c.name.charAt(0).toUpperCase();
    const name = document.createElement('h3');
    name.textContent = c.name;
    const count = document.createElement('p');
    count.textContent = `${c.document_count} ${t('documents')}`;
    card.append(dot, name, count);
    card.onclick = () => openCourse(c.id);
    list.append(card);

    const navButton = document.createElement('button');
    navButton.textContent = c.name;
    navButton.onclick = () => openCourse(c.id);
    nav.append(navButton);
  });
}
async function loadCourses(){state.courses=await request('/courses');renderCourses();}
async function openCourse(id){state.course=await request(`/courses/${id}`);$('#title').textContent=state.course.name;$('#crumb').textContent=t('subjects');$('#course-name').textContent=t('courseDocuments');renderCourses();renderDocuments();}

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
function study(d){state.document=d;state.card=0;$('#study-source').textContent=d.filename;renderCard();renderQuiz();$('#study-dialog').showModal();}
function renderCard(){const cards=state.document.flashcards;if(!cards.length)return;const card=cards[state.card];$('#card-count').textContent=`${state.card+1} / ${cards.length}`;$('#front').textContent=card.front;$('#back').textContent=card.back;$('#card').classList.remove('flipped');}
function renderQuiz(){const q=state.document.questions[0];const answers=$('#answers');answers.replaceChildren();if(!q){$('#question').textContent=t('noQuestions');return;}$('#question').textContent=q.question;q.options.forEach((o,i)=>{const b=document.createElement('button');b.textContent=`${String.fromCharCode(65+i)}. ${o}`;b.onclick=()=>{b.classList.add(i===q.answer_index?'right':'wrong');$('#feedback').textContent=q.explanation;};answers.append(b);});}
async function createCourse(){const name=$('#course-input').value.trim();if(!name)return;try{const c=await request('/courses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});$('#course-dialog').close();$('#course-form').reset();state.course=null;await loadCourses();openCourse(c.id);}catch(e){toast(e.message);}}
async function upload(e){const file=e.target.files[0];if(!file||!state.course)return;const body=new FormData();body.append('file',file);toast(t('processing'));try{await request(`/courses/${state.course.id}/documents:generate`,{method:'POST',body});toast(t('saved'));await openCourse(state.course.id);}catch(error){toast(error.message);}finally{e.target.value='';}}
$('#new-course').onclick=$('#empty-new').onclick=()=>$('#course-dialog').showModal();$('#course-form').onsubmit=e=>{e.preventDefault();createCourse();};$('#home').onclick=()=>{state.course=null;applyLanguage();};$('.brand').onclick=e=>{e.preventDefault();$('#home').click();};$('#file').onchange=upload;$('#card').onclick=()=>$('#card').classList.toggle('flipped');$('#prev').onclick=()=>{state.card=(state.card+state.document.flashcards.length-1)%state.document.flashcards.length;renderCard();};$('#next').onclick=()=>{state.card=(state.card+1)%state.document.flashcards.length;renderCard();};$('#close-study').onclick=()=>$('#study-dialog').close();document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#cards-panel').hidden=b.dataset.tab!=='cards';$('#quiz-panel').hidden=b.dataset.tab!=='quiz';});$('#language').onclick=()=>{state.language=state.language==='en'?'vi':'en';localStorage.setItem('n-learny-language',state.language);applyLanguage();};$('#theme').onclick=toggleTheme;

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
});
applyTheme();
applyLanguage();
if (localStorage.getItem('n-learny-user')) initializeLearning();
