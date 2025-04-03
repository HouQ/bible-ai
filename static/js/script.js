async function loadBooks() {
    try {
        const response = await fetch('/api/books');
        const books = await response.json();
        const bookSelect = document.getElementById('bookSelect');
        bookSelect.innerHTML = '<option value="">选择书卷</option>';
        books.forEach(book => {
            const option = document.createElement('option');
            option.value = book.SN;
            option.textContent = book.FullName;
            bookSelect.appendChild(option);
        });
    } catch (error) {
        console.error('加载书卷失败:', error);
    }
}

async function loadChapters(volumeSn) {
    try {
        const response = await fetch(`/api/chapters/${volumeSn}`);
        const chapters = await response.json();
        const chapterSelect = document.getElementById('chapterSelect');
        chapterSelect.innerHTML = '';
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'chapter-buttons';
        // 确保章节按照数字顺序排序
        chapters.sort((a, b) => a.ChapterSN - b.ChapterSN);
        chapters.forEach(chapter => {
            const button = document.createElement('button');
            button.className = 'btn btn-outline-primary chapter-button';
            button.textContent = chapter.ChapterSN;
            button.onclick = async () => {
                const selectedVolumeSn = document.getElementById('bookSelect').value;
                if (selectedVolumeSn) {
                    currentVolumeSn = parseInt(selectedVolumeSn);
                    currentChapterSn = chapter.ChapterSN;
                    await loadVerses(selectedVolumeSn, chapter.ChapterSN);
                    saveReadingProgress();
                }
            };
            buttonContainer.appendChild(button);
        });
        chapterSelect.appendChild(buttonContainer);
    } catch (error) {
        console.error('加载章节失败:', error);
    }
}

// 保存阅读进度
function saveReadingProgress() {
    if (currentVolumeSn && currentChapterSn) {
        localStorage.setItem('bibleReadingProgress', JSON.stringify({
            volumeSn: currentVolumeSn,
            chapterSn: currentChapterSn
        }));
    }
}

// 加载上次阅读进度
async function loadReadingProgress() {
    const progress = localStorage.getItem('bibleReadingProgress');
    if (progress) {
        const { volumeSn, chapterSn } = JSON.parse(progress);
        if (volumeSn) {
            currentVolumeSn = volumeSn;
            document.getElementById('bookSelect').value = volumeSn;
            await loadChapters(volumeSn);
            if (chapterSn) {
                currentChapterSn = chapterSn;
                document.getElementById('chapterSelect').value = chapterSn;
                await loadVerses(volumeSn, chapterSn);
            }
        }
    }
}

let selectedVerses = [];

async function loadVerses(volumeSn, chapterSn) {
    try {
        const response = await fetch(`/api/verses/${volumeSn}/${chapterSn}`);
        const verses = await response.json();
        const bibleContent = document.getElementById('bibleContent');
        bibleContent.innerHTML = verses.map(verse => 
            `<p class="verse" data-verse-sn="${verse.VerseSN}" data-chapter-sn="${chapterSn}" data-volume-sn="${volumeSn}">
                <span class="verse-number">${verse.VerseSN}</span>${verse.Lection}
            </p>`
        ).join('');

        // 为每个经文添加点击事件
        document.querySelectorAll('.verse').forEach(verse => {
            verse.addEventListener('click', handleVerseClick);
            // 移除右键菜单事件，使用底部固定菜单代替
        });
    } catch (error) {
        console.error('加载经文失败:', error);
    }
}

// 处理经文点击
function handleVerseClick(event) {
    const verse = event.currentTarget;
    verse.classList.toggle('selected');
    
    if (verse.classList.contains('selected')) {
        selectedVerses.push({
            volumeSn: verse.dataset.volumeSn,
            chapterSn: verse.dataset.chapterSn,
            verseSn: verse.dataset.verseSn,
            text: verse.textContent.trim()
        });
    } else {
        selectedVerses = selectedVerses.filter(v => 
            !(v.volumeSn === verse.dataset.volumeSn && 
              v.chapterSn === verse.dataset.chapterSn && 
              v.verseSn === verse.dataset.verseSn)
        );
    }
    
    // 更新底部菜单显示状态
    updateActionMenuVisibility();
}

// 更新底部操作菜单的显示状态
function updateActionMenuVisibility() {
    const actionMenu = document.getElementById('verseActionMenu');
    if (selectedVerses.length > 0) {
        actionMenu.style.display = 'block';
    } else {
        actionMenu.style.display = 'none';
    }
}


// 不再需要右键菜单处理函数，因为我们使用底部固定菜单

// 初始化菜单事件
document.addEventListener('DOMContentLoaded', () => {

    // 注解按钮点击事件
    document.getElementById('annotationBtn').addEventListener('click', () => {
        if (selectedVerses.length === 0) return;
        
        const annotationModal = new bootstrap.Modal(document.getElementById('annotationModal'));
        const annotationContent = document.getElementById('annotationContent');
        annotationContent.innerHTML = '<div class="loading-text">正在生成注解...</div>';
        annotationModal.show();

        // 直接使用HTML输出，不再需要marked库
        let annotationHtml = '';
        const eventSource = new EventSource('/api/annotation?' + new URLSearchParams({
            verses: JSON.stringify(selectedVerses)
        }));

        eventSource.onmessage = (event) => {
            if (event.data) {
                // 直接将接收到的数据作为HTML添加到内容中
                annotationHtml += event.data;
                annotationContent.innerHTML = annotationHtml;
            }
        };

        eventSource.onerror = () => {
            eventSource.close();
            if (!annotationContent.innerHTML || annotationContent.innerHTML === '<div class="loading-text">正在生成注解...</div>') {
                annotationContent.innerHTML = '获取注解失败，请稍后重试';
            }
        };

        // 当模态框关闭时，关闭EventSource连接
        document.getElementById('annotationModal').addEventListener('hidden.bs.modal', () => {
            eventSource.close();
        }, { once: true });
    });

    // 提问按钮点击事件
    document.getElementById('questionBtn').addEventListener('click', () => {
        if (selectedVerses.length === 0) return;

        const questionModal = new bootstrap.Modal(document.getElementById('questionModal'));
        document.getElementById('selectedVerses').innerHTML = selectedVerses
            .map(verse => `<p>${verse.text}</p>`)
            .join('');
        document.getElementById('questionInput').value = '';
        document.getElementById('answerContent').innerHTML = '';
        questionModal.show();
    });

    // 提交问题按钮点击事件
    document.getElementById('submitQuestion').addEventListener('click', () => {
        const question = document.getElementById('questionInput').value.trim();
        if (!question) return;

        document.getElementById('answerContent').innerHTML = '';

        const eventSource = new EventSource('/api/question?' + new URLSearchParams({
            verses: JSON.stringify(selectedVerses),
            question: question
        }));

        // 使用变量累积接收到的HTML内容，然后一次性设置innerHTML
        let answerHtml = '';
        eventSource.onmessage = (event) => {
            if (event.data) {
                // 累积接收到的数据
                answerHtml += event.data;
                // 设置innerHTML以正确渲染HTML
                document.getElementById('answerContent').innerHTML = answerHtml;
            }
        };

        eventSource.onerror = () => {
            eventSource.close();
            if (!document.getElementById('answerContent').innerHTML) {
                document.getElementById('answerContent').innerHTML = '获取答案失败，请稍后重试';
            }
        };

        // 当模态框关闭时，关闭EventSource连接
        document.getElementById('questionModal').addEventListener('hidden.bs.modal', () => {
            eventSource.close();
        }, { once: true });
    });
});


async function searchBible(query) {
    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const results = await response.json();
        const bibleContent = document.getElementById('bibleContent');
        if (results.length === 0) {
            bibleContent.innerHTML = '<p>未找到匹配的经文</p>';
            return;
        }
        bibleContent.innerHTML = results.map(result => 
            `<p><strong>${result.FullName} ${result.ChapterSN}:${result.VerseSN}</strong><br>${result.Lection}</p>`
        ).join('');
    } catch (error) {
        console.error('搜索失败:', error);
    }
}

let currentVolumeSn = null;
let currentChapterSn = null;

document.addEventListener('DOMContentLoaded', () => {
    loadBooks().then(() => loadReadingProgress());

    const bookSelect = document.getElementById('bookSelect');
    const chapterSelect = document.getElementById('chapterSelect');
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const prevChapter = document.getElementById('prevChapter');
    const nextChapter = document.getElementById('nextChapter');
    const decreaseFont = document.getElementById('decreaseFont');
    const increaseFont = document.getElementById('increaseFont');

    bookSelect.addEventListener('change', (e) => {
        const volumeSn = e.target.value;
        if (volumeSn) {
            currentVolumeSn = parseInt(volumeSn);
            loadChapters(volumeSn);
            saveReadingProgress();
        } else {
            chapterSelect.innerHTML = '<option value="">选择章节</option>';
            document.getElementById('bibleContent').innerHTML = '请选择要阅读的书卷和章节';
        }
    });

    // 移除旧的章节选择事件监听器，因为现在使用按钮点击事件

    searchButton.addEventListener('click', () => {
        const query = searchInput.value.trim();
        if (query) {
            searchBible(query);
        }
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = searchInput.value.trim();
            if (query) {
                searchBible(query);
            }
        }
    });

    prevChapter.addEventListener('click', () => {
        if (currentChapterSn > 1) {
            currentChapterSn--;
            loadVerses(currentVolumeSn, currentChapterSn);
            chapterSelect.value = currentChapterSn;
            saveReadingProgress();
        }
    });

    nextChapter.addEventListener('click', () => {
        if (currentChapterSn) {
            currentChapterSn++;
            loadVerses(currentVolumeSn, currentChapterSn);
            chapterSelect.value = currentChapterSn;
            saveReadingProgress();
        }
    });

    let currentFontSize = 1.1;
    const fontSizeStep = 0.1;

    decreaseFont.addEventListener('click', () => {
        if (currentFontSize > 0.8) {
            currentFontSize -= fontSizeStep;
            document.querySelector('.bible-content').style.fontSize = `${currentFontSize}em`;
        }
    });

    increaseFont.addEventListener('click', () => {
        if (currentFontSize < 2.0) {
            currentFontSize += fontSizeStep;
            document.querySelector('.bible-content').style.fontSize = `${currentFontSize}em`;
        }
    });
});