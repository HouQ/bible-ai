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

        // 更新顶部标题
        const bookSelect = document.getElementById('bookSelect');
        const bookName = bookSelect.options[bookSelect.selectedIndex]?.textContent || '';
        const chapterHeader = document.getElementById('currentBookChapter');
        if (chapterHeader) {
            chapterHeader.textContent = `${bookName} ${chapterSn}章`;
        }

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
    const selectedVersesInfo = document.getElementById('selectedVersesInfo');
    
    if (selectedVerses.length > 0) {
        actionMenu.style.display = 'block';
        
        // 按书卷和章节分组
        const groups = {};
        selectedVerses.forEach(verse => {
            const key = `${verse.volumeSn}_${verse.chapterSn}`;
            if (!groups[key]) {
                groups[key] = {
                    volumeSn: verse.volumeSn,
                    chapterSn: verse.chapterSn,
                    verses: []
                };
            }
            groups[key].verses.push(parseInt(verse.verseSn));
        });

        const bookSelect = document.getElementById('bookSelect');
        const groupInfos = [];

        Object.values(groups).forEach(group => {
            const bookOption = bookSelect.querySelector(`option[value="${group.volumeSn}"]`);
            const bookName = bookOption ? bookOption.textContent : '未知书卷';
            
            const verses = group.verses.sort((a, b) => a - b);
            let verseRange = '';
            let start = verses[0];
            let end = verses[0];
            
            for (let i = 1; i < verses.length; i++) {
                if (verses[i] === end + 1) {
                    end = verses[i];
                } else {
                    if (start === end) {
                        verseRange += (verseRange ? ',' : '') + start;
                    } else {
                        verseRange += (verseRange ? ',' : '') + start + '-' + end;
                    }
                    start = verses[i];
                    end = verses[i];
                }
            }
            
            if (start === end) {
                verseRange += (verseRange ? ',' : '') + start;
            } else {
                verseRange += (verseRange ? ',' : '') + start + '-' + end;
            }
            
            groupInfos.push(`${bookName} ${group.chapterSn}:${verseRange}`);
        });

        selectedVersesInfo.textContent = groupInfos.join('；');
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
        
        // 获取建议问题
        loadSuggestedQuestions();
        
        questionModal.show();
    });

    // 获取建议问题
    function loadSuggestedQuestions() {
        const suggestedQuestionsDiv = document.getElementById('suggestedQuestions');
        suggestedQuestionsDiv.innerHTML = '<div class="text-muted">正在生成建议问题...</div>';
        
        fetch(`/api/suggested-questions?verses=${encodeURIComponent(JSON.stringify(selectedVerses))}`)
            .then(response => response.json())
            .then(data => {
                if (data.questions && data.questions.length > 0) {
                    suggestedQuestionsDiv.innerHTML = data.questions
                        .map(question => 
                            `<button type="button" class="btn btn-outline-secondary btn-sm common-question" data-question="${question}">${question}</button>`
                        )
                        .join('');
                } else {
                    suggestedQuestionsDiv.innerHTML = '<div class="text-muted">无法生成建议问题</div>';
                }
            })
            .catch(error => {
                console.error('获取建议问题失败:', error);
                suggestedQuestionsDiv.innerHTML = '<div class="text-muted">获取建议问题失败</div>';
            });
    }

    // 原文按钮点击事件
    document.getElementById('originalBtn').addEventListener('click', () => {
        if (selectedVerses.length === 0) {
            alert('请先选择经文');
            return;
        }
        
        const originalModal = new bootstrap.Modal(document.getElementById('originalModal'));
        
        // 显示选中的经文
        document.getElementById('originalVerses').innerHTML = selectedVerses
            .map(verse => `<p><strong>${verse.volumeSn} ${verse.chapterSn}:${verse.verseSn}</strong> - ${verse.text}</p>`)
            .join('');
        
        // 显示加载状态
        document.getElementById('originalContent').innerHTML = '<div class="text-center"><div class="spinner-border" role="status"><span class="visually-hidden">加载中...</span></div></div>';
        document.getElementById('translationContent').innerHTML = '';
        
        // 获取原文和直译
        loadOriginalText();
        
        originalModal.show();
    });

    // 获取原文和直译
    function loadOriginalText() {
        fetch('/api/original-text', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ verses: selectedVerses })
        })
        .then(response => response.json())
        .then(data => {
            // 显示原文内容
            document.getElementById('originalContent').innerHTML = `
                <h6>原文：</h6>
                <div class="mb-3" style="font-family: 'Times New Roman', serif; font-size: 1.1em;">
                    ${data.original || '原文暂缺'}
                </div>
                
                <h6>中文音译：</h6>
                <div class="mb-3 text-muted">
                    ${data.transliteration || '音译暂缺'}
                </div>
            `;
            
            // 显示直译内容
            document.getElementById('translationContent').innerHTML = `
                <h6>中文直译：</h6>
                <div class="mb-3">
                    <strong>${data.literal_translation || '直译暂缺'}</strong>
                </div>
                
                <h6>中文语法说明：</h6>
                <div class="text-muted">
                    ${data.grammar_notes || '语法说明暂缺'}
                </div>
            `;
        })
        .catch(error => {
            console.error('获取原文失败:', error);
            document.getElementById('originalContent').innerHTML = '<div class="alert alert-danger">获取原文失败，请稍后重试。</div>';
            document.getElementById('translationContent').innerHTML = '';
        });
    }

    // 常见问题点击事件
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('common-question')) {
            const question = e.target.dataset.question;
            const questionInput = document.getElementById('questionInput');
            if (questionInput) {
                questionInput.value = question;
                // 自动触发提交
                document.getElementById('submitQuestion').click();
            }
        }
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
    
    // 添加清除选中经文的事件监听器
    const clearBtn = document.getElementById('clearSelectedVerses');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            // 清除所有选中的经文
            document.querySelectorAll('.verse.selected').forEach(verse => {
                verse.classList.remove('selected');
            });
            selectedVerses = [];
            updateActionMenuVisibility();
        });
    }

    const bookSelect = document.getElementById('bookSelect');
    const chapterSelect = document.getElementById('chapterSelect');
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');

    if (bookSelect) {
        bookSelect.addEventListener('change', (e) => {
            const volumeSn = e.target.value;
            if (volumeSn) {
                currentVolumeSn = parseInt(volumeSn);
                loadChapters(volumeSn);
                saveReadingProgress();
            } else {
                if (chapterSelect) {
                    chapterSelect.innerHTML = '<option value="">选择章节</option>';
                }
                const bibleContent = document.getElementById('bibleContent');
                if (bibleContent) {
                    bibleContent.innerHTML = '请选择要阅读的书卷和章节';
                }
            }
        });
    }

    // 移除旧的章节选择事件监听器，因为现在使用按钮点击事件

    if (searchButton && searchInput) {
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
    }

    // 本章大纲按钮点击事件
    document.getElementById('outlineBtn').addEventListener('click', () => {
        if (selectedVerses.length === 0) {
            alert('请先选择经文以确定章节');
            return;
        }

        const outlineModal = new bootstrap.Modal(document.getElementById('outlineModal'));
        
        // 获取当前章节信息
        const currentChapter = selectedVerses[0];
        const bookName = currentChapter.volumeSn;
        const chapterNum = currentChapter.chapterSn;
        
        // 显示章节标题
        const bookSelect = document.getElementById('bookSelect');
        const bookFullName = bookSelect.querySelector(`option[value="${bookName}"]`)?.textContent || bookName;
        document.getElementById('outlineModalLabel').textContent = `${bookFullName} ${chapterNum}章大纲`;
        
        // 显示加载状态
        document.getElementById('mindmapLoading').style.display = 'block';
        document.getElementById('mindmapContainer').innerHTML = '<div id="mindmapLoading"><div class="spinner-border" role="status"><span class="visually-hidden">加载中...</span></div><p class="mt-2 text-muted">正在生成本章思维导图...</p></div>';
        
        // 获取本章大纲并生成思维导图
        loadChapterOutline(bookName, chapterNum);
        
        outlineModal.show();
    });
    
    // 保存为图片功能
    document.getElementById('saveOutlineBtn').addEventListener('click', function() {
        const mindmapContainer = document.getElementById('mindmapContainer');
        
        // 创建临时容器用于截图
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '-9999px';
        tempContainer.style.width = mindmapContainer.offsetWidth + 'px';
        tempContainer.style.backgroundColor = '#ffffff';
        tempContainer.innerHTML = mindmapContainer.innerHTML;
        document.body.appendChild(tempContainer);
        
        // 显示加载提示
        const saveBtn = this;
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>生成中...';
        saveBtn.disabled = true;
        
        setTimeout(() => {
            html2canvas(tempContainer, {
                backgroundColor: '#ffffff',
                scale: 2,
                useCORS: true,
                allowTaint: true
            }).then(canvas => {
                // 清理临时容器
                document.body.removeChild(tempContainer);
                
                // 恢复按钮状态
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
                
                // 创建下载链接
                const bookSelect = document.getElementById('bookSelect');
                const bookFullName = bookSelect.querySelector(`option[value="${selectedVerses[0]?.volumeSn}"]`)?.textContent || selectedVerses[0]?.volumeSn || '未知';
                const link = document.createElement('a');
                link.download = `圣经大纲_${bookFullName}_第${selectedVerses[0]?.chapterSn || '未知'}章.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            }).catch(error => {
                console.error('生成图片失败:', error);
                document.body.removeChild(tempContainer);
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
                alert('生成图片失败，请重试');
            });
        }, 100);
    });

    // 获取本章大纲并生成思维导图
    function loadChapterOutline(bookName, chapterNum) {
        fetch('/api/chapter-outline', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                book: bookName, 
                chapter: chapterNum 
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.outline) {
                renderMindmap(data.outline);
            } else {
                document.getElementById('mindmapContainer').innerHTML = '<div class="text-center text-muted">无法生成本章大纲</div>';
            }
        })
        .catch(error => {
            console.error('获取本章大纲失败:', error);
            document.getElementById('mindmapContainer').innerHTML = '<div class="text-center text-muted">获取本章大纲失败</div>';
        });
    }

    // 渲染思维导图
    function renderMindmap(markdownContent) {
        try {
            // 隐藏加载状态
            document.getElementById('mindmapLoading').style.display = 'none';
            
            // 创建新的容器
            const container = document.getElementById('mindmapContainer');
            container.className = 'mindmap-container';
            
            // 将markdown转换为HTML树形结构
            const lines = markdownContent.split('\n');
            let html = '<div style="padding: 20px;">';
            
            lines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed) {
                    const level = (line.match(/^#+/) || [''])[0].length;
                    const content = trimmed.replace(/^#+\s*/, '');
                    
                    if (level > 0) {
                        const levelClass = `level-${level}`;
                        html += `<div class="mindmap-item ${levelClass}">${content}</div>`;
                    } else if (trimmed && !line.startsWith('---')) {
                        // 处理普通文本行
                        html += `<div class="mindmap-item level-3">${trimmed}</div>`;
                    }
                }
            });
            
            html += '</div>';
            container.innerHTML = html;
            
        } catch (error) {
            console.error('渲染思维导图失败:', error);
            document.getElementById('mindmapContainer').innerHTML = '<div class="text-center text-muted">渲染思维导图失败</div>';
        }
    }
});