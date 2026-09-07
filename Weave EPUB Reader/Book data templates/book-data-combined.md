---
title: "{{ book.displayTitle }}"
author: "{{ book.author }}"
translator: "{{ book.translator }}"
publisher: "{{ book.publisher }}"
published: "{{ book.published }}"
language: "{{ book.language }}"
category: "{{ book.category }}"
keywords: []
description: "{{ book.description }}"
book: "[[{{ book.filePath }}]]"
cover: "{{ book.coverPath }}"
progress: {{ book.progress }}
status: {{ book.status }}
lastRead: "{{ book.lastRead }}"
rating:
tags: []
cssclasses:
  - weave-epub-book-data-page
---

<!-- weave-epub:book-data-template-rev:12 -->

> [!abstract] {{ book.displayTitle }}
> <div class="weave-epub-book-data-card" markdown="1">
>
> ![[{{ book.coverPath }}|160]]
>
> - **作者** {{ book.author }}
> - **译者** {{ book.translator }}
> - **出版社** {{ book.publisher }}
> - **出版时间** {{ book.published }}
> - **语言** {{ book.language }}
> - **分类** {{ book.category }}
>
> {{ book.description }}
>
> {{ book.readingLine }}
>
> [[{{ book.filePath }}|📖 开始阅读]]
>
> </div>

---

## 书籍目录

{{ book.toc }}

---

## 随记

---div---

（在此自由书写。插件不会改写以上内容。）

---div---

---

## 摘录

{{ book.excerpts }}

<!-- weave-epub:machine:start -->
{{ weave_epub_machine_block }}
<!-- weave-epub:machine:end -->
