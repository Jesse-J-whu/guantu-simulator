# 文档完整性检查:docs/ 下所有 markdown 的内部链接与图片引用是否存在。
# 用法:python3 scripts/docs-gen/check_links.py  (exit 1 = 有失效引用)
import os
import re
import sys

DOCS = os.path.join(os.path.dirname(__file__), '..', '..', 'docs')
DOCS = os.path.abspath(DOCS)
problems = []
n_md = n_img = n_link = 0

for root, _dirs, files in os.walk(DOCS):
    for fn in files:
        if not fn.endswith('.md'):
            continue
        n_md += 1
        fp = os.path.join(root, fn)
        rel = os.path.relpath(fp, DOCS)
        with open(fp, encoding='utf-8') as f:
            text = f.read()
        # 剔除代码块与行内代码,避免示例语法被当成真实引用
        text = re.sub(r'```.*?```', '', text, flags=re.S)
        text = re.sub(r'`[^`\n]*`', '', text)
        for m in re.finditer(r'!\[[^\]]*\]\(([^)#\s]+)\)', text):
            n_img += 1
            tgt = os.path.normpath(os.path.join(root, m.group(1)))
            if not os.path.exists(tgt):
                problems.append(f'{rel}: 缺图 {m.group(1)}')
        for m in re.finditer(r'(?<!!)\[[^\]]+\]\(([^)#\s]+)\)', text):
            n_link += 1
            tgt = os.path.normpath(os.path.join(root, m.group(1)))
            if not os.path.exists(tgt):
                problems.append(f'{rel}: 死链 {m.group(1)}')

print(f'md 文件 {n_md} | 嵌入图片引用 {n_img} | 内部链接 {n_link}')
if problems:
    print(f'失效 {len(problems)} 处:')
    for p in problems:
        print(' -', p)
    sys.exit(1)
print('全部引用有效')
