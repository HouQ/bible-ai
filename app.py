from flask import Flask, jsonify, request, send_file, Response
from flask_cors import CORS
import sqlite3
import os
import json
from openai import OpenAI

# 初始化OpenAI客户端
client = OpenAI(
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    api_key=os.environ.get("ARK_API_KEY", "")
)

app = Flask(__name__, static_url_path='/static', static_folder='static')
CORS(app)

@app.route('/')
def index():
    return send_file('index.html')

def get_db_connection():
    conn = sqlite3.connect('bible.db')
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/api/books', methods=['GET'])
def get_books():
    conn = get_db_connection()
    books = conn.execute('SELECT * FROM BibleID').fetchall()
    conn.close()
    return jsonify([dict(book) for book in books])

@app.route('/api/chapters/<int:volume_sn>', methods=['GET'])
def get_chapters(volume_sn):
    conn = get_db_connection()
    chapters = conn.execute('SELECT DISTINCT ChapterSN FROM Bible WHERE VolumeSN = ?', [volume_sn]).fetchall()
    conn.close()
    return jsonify([dict(chapter) for chapter in chapters])

@app.route('/api/verses/<int:volume_sn>/<int:chapter_sn>', methods=['GET'])
def get_verses(volume_sn, chapter_sn):
    conn = get_db_connection()
    verses = conn.execute('SELECT * FROM Bible WHERE VolumeSN = ? AND ChapterSN = ?', [volume_sn, chapter_sn]).fetchall()
    conn.close()
    return jsonify([dict(verse) for verse in verses])

@app.route('/api/search', methods=['GET'])
def search_bible():
    query = request.args.get('q', '')
    if not query:
        return jsonify([])
    
    conn = get_db_connection()
    results = conn.execute(
        'SELECT b.*, bi.FullName FROM Bible b JOIN BibleID bi ON b.VolumeSN = bi.KindSN WHERE b.Lection LIKE ?',
        [f'%{query}%']
    ).fetchall()
    conn.close()
    return jsonify([dict(result) for result in results])

@app.route('/api/annotation', methods=['GET'])
def get_annotation():
    verses = request.args.get('verses', '')
    try:
        verses = json.loads(verses)
    except:
        return jsonify({'error': '参数格式错误'}), 400
    if not verses:
        return jsonify({'error': '未选择经文'}), 400
    
    # 构建经文内容
    verses_text = '\n'.join([f"{verse['text']}" for verse in verses])
    
    def generate():
        try:
            # 调用OpenAI API获取注解，直接返回HTML格式
            response = client.chat.completions.create(
                model="ep-20250327141820-mfncl",
                messages=[
                    {"role": "system", "content": "你是一个专业的圣经学者，请对所给经文进行详细的解经和释经。请直接以HTML格式输出，使用适当的HTML标签如<p>、<h1>、<h2>、<ul>、<li>、<table>等来格式化你的回答；如果有table,为其加上class='table table-striped',不要给出style。"},
                    {"role": "user", "content": f"请对以下经文进行注解：\n{verses_text}"}
                ],
                stream=True
            )
            
            for chunk in response:
                if chunk.choices[0].delta.content is not None:
                    yield f"data: {chunk.choices[0].delta.content}\n\n"
        except Exception as e:
            yield f"data: {str(e)}\n\n"
    
    return Response(generate(), mimetype='text/event-stream')

@app.route('/api/question', methods=['GET'])
def ask_question():
    verses = request.args.get('verses', '')
    question = request.args.get('question', '')
    
    try:
        verses = json.loads(verses)
    except:
        return jsonify({'error': '参数格式错误'}), 400
        
    if not verses or not question:
        return jsonify({'error': '参数不完整'}), 400
    
    # 构建经文内容
    verses_text = '\n'.join([f"{verse['text']}" for verse in verses])
    
    def generate():
        try:
            # 调用OpenAI API获取答案，直接返回HTML格式
            response = client.chat.completions.create(
                model="ep-20250327141820-mfncl",
                messages=[
                    {"role": "system", "content": "你是一个专业的圣经学者，请基于所给经文回答问题。请直接以HTML格式输出，使用适当的HTML标签如<p>、<h1>、<h2>、<ul>、<li>、<table>等来格式化你的回答，如果有table,为其加上class='table table-striped',不要给出style。"},
                    {"role": "user", "content": f"基于以下经文：\n{verses_text}\n\n回答问题：{question}"}
                ],
                stream=True
            )
            
            for chunk in response:
                if chunk.choices[0].delta.content is not None:
                    yield f"data: {chunk.choices[0].delta.content}\n\n"
        except Exception as e:
            yield f"data: {str(e)}\n\n"
    
    return Response(generate(), mimetype='text/event-stream')

@app.route('/api/suggested-questions', methods=['GET'])
def get_suggested_questions():
    verses = request.args.get('verses', '')
    
    try:
        verses = json.loads(verses)
    except:
        return jsonify({'error': '参数格式错误'}), 400
        
    if not verses:
        return jsonify({'error': '未选择经文'}), 400
    
    # 构建经文内容
    verses_text = '\n'.join([f"{verse['text']}" for verse in verses])
    
    try:
        # 调用OpenAI API生成建议问题
        response = client.chat.completions.create(
            model="ep-20250327141820-mfncl",
            messages=[
                {"role": "system", "content": """你是一个专业的圣经学者，请基于所给经文生成3个最常被问到的相关问题。请只返回纯JSON字符串，不要包含```json标记或其他格式，格式如下：{"questions": ["问题1", "问题2", "问题3"]}"""},
                {"role": "user", "content": f"基于以下经文生成建议问题：\n{verses_text}"}
            ],
            temperature=0.7,
            max_tokens=200
        )
        
        # 解析返回的JSON
        content = response.choices[0].message.content
        print(content)
        
        # 清理响应文本
        content = content.strip()
        if content.startswith('```json'):
            content = content[7:]
        if content.endswith('```'):
            content = content[:-3]
        content = content.strip()
        
        questions_data = json.loads(content)
        return jsonify(questions_data)
        
    except Exception as e:
        # 如果AI生成失败，返回默认问题
        return jsonify({
            'questions': [
                '这段经文的主要信息是什么？',
                '这段经文对我有什么应用？',
                '这段经文的历史背景是什么？'
            ]
        })

@app.route('/api/original-text', methods=['POST'])
def get_original_text():
    """获取选中经文的原文和直译"""
    try:
        data = request.json
        verses = data.get('verses', [])
        
        if not verses:
            return jsonify({"error": "请选择经文"}), 400
        
        # 获取经文内容
        verses_text = ""
        for verse in verses:
            book_name = verse.get('book_name', '')
            chapter = verse.get('chapter', '')
            verse_num = verse.get('verse', '')
            text = verse.get('text', '')
            verses_text += f"{book_name} {chapter}:{verse_num} - {text}\n"
        
        # 使用OpenAI API获取原文和直译
        response = client.chat.completions.create(
            model="ep-20250327141820-mfncl",
            messages=[
                {"role": "system", "content": """你是一个专业的圣经学者，精通希伯来语和希腊语原文。请基于所给的中文经文，提供：
                1. 对应的原文（希伯来语或希腊语）
                2. 每个原文词汇的中文音译
                3. 按原文语法结构的中文直译
                4. 简要解释原文语法特点（用中文说明）
                
                请严格按照以下JSON格式返回，确保所有字段都有值：
                {"original": "原文内容", "transliteration": "中文音译", "literal_translation": "中文直译", "grammar_notes": "中文语法说明"}
                请只返回纯JSON字符串，不要包含```json标记或其他格式。"""},
                {"role": "user", "content": f"请分析以下经文的中文原文和直译：\n{verses_text}"}
            ],
            temperature=0.3,
            max_tokens=2000
        )
        
        content = response.choices[0].message.content
        
        # 清理响应文本
        content = content.strip()
        if content.startswith('```json'):
            content = content[7:]
        if content.endswith('```'):
            content = content[:-3]
        content = content.strip()
        
        original_data = json.loads(content)
        
        # 确保所有字段都有值，避免undefined
        result = {
            "original": original_data.get("original", "原文暂缺"),
            "transliteration": original_data.get("transliteration", "音译暂缺"),
            "literal_translation": original_data.get("literal_translation", "直译暂缺"),
            "grammar_notes": original_data.get("grammar_notes", "语法说明暂缺")
        }
        
        return jsonify(result)
        
    except Exception as e:
        print(f"原文分析错误: {str(e)}")
        # 返回默认数据
        return jsonify({
            "original": "原文获取中...",
            "transliteration": "音译获取中...",
            "literal_translation": "直译获取中...",
            "grammar_notes": "很抱歉，原文分析暂时无法使用，请稍后重试。"
        })

@app.route('/api/chapter-outline', methods=['POST'])
def get_chapter_outline():
    try:
        data = request.json
        book = data.get('book')
        chapter = data.get('chapter')
        
        if not book or not chapter:
            return jsonify({"error": "缺少书卷或章节信息"}), 400
        print(book)
        print(chapter)
        # 获取章节内容用于生成大纲
        conn = sqlite3.connect('bible.db')
        cursor = conn.cursor()
        
        # 获取书卷全名
        cursor.execute("SELECT FullName FROM BibleID WHERE SN = ?", (book,))
        book_name_result = cursor.fetchone()
        book_full_name = book_name_result[0] if book_name_result else str(book)
        
        # cursor.execute("SELECT verseSn, text FROM bible WHERE volumeSn = ? AND chapterSn = ? ORDER BY verseSn", 
        #               (book, chapter))
        # verses = cursor.fetchall()
        conn.close()
        
        # if not verses:
        #     return jsonify({"error": "未找到该章节"}), 404
        
        # 调用大模型生成本章大纲
        prompt = f"""
        请为《{book_full_name}》第{chapter}章生成一个详细的思维导图大纲。
        
        要求：
        1. 使用Markdown格式，以思维导图的结构呈现
        2. 包含主要主题、子主题、关键经文引用
        3. 使用清晰的层级结构（#、##、###等）
        4. 每个要点后添加对应的经文引用（如：约翰福音3:16）
        5. 使用中文描述
        6. 确保思维导图逻辑清晰，便于可视化展示
        
        请返回纯Markdown格式的思维导图大纲，不要包含代码块标记。
        """
        
        messages = [
            {"role": "system", "content": "你是一个圣经专家，擅长分析经文结构和生成思维导图大纲。"},
            {"role": "user", "content": prompt}
        ]
        
        response = client.chat.completions.create(
            model="ep-20250327141820-mfncl",
            messages=messages,
            max_tokens=2000,
            temperature=0.7
        )
        
        outline = response.choices[0].message.content.strip()
        
        return jsonify({"outline": outline})
        
    except Exception as e:
        print(f"本章大纲生成错误: {str(e)}")
        return jsonify({
            "outline": f"# {book} {chapter}章大纲\n\n## 主题概述\n- 由于技术原因，暂时无法生成详细大纲\n- 建议阅读整章经文以获得完整理解\n\n## 关键经文\n- 请参考本章全部内容"
        })

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)