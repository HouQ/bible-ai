from flask import Flask, jsonify, request, send_file, Response
from flask_cors import CORS
import sqlite3
import os
import json
from openai import OpenAI

# 初始化OpenAI客户端
client = OpenAI(
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    api_key=os.environ.get("ARK_API_KEY")
    
)

app = Flask(__name__, static_url_path='/static', static_folder='static')
CORS(app)

@app.route('/')
def index():
    return send_file('index.html')

def get_db_connection():
    conn = sqlite3.connect('bible_简体中文和合本.db')
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

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)