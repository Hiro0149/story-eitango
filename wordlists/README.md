# 語彙リスト

## cefrj-vocabulary-profile-1.5.csv

出典: The CEFR-J Wordlist Version 1.5. Compiled by Yukio Tono, Tokyo University of Foreign Studies.
Retrieved from http://www.cefr-j.org/download.html (via https://github.com/openlanguageprofiles/olp-en-cefrj, 2026-11-15 取得)

利用条件(配布元 README より): 出典を明記すれば、研究・商用とも無償で利用できる。著作権は東京外国語大学 投野研究室。
アプリを公開するときは、上の出典表記をアプリ内にも載せること。

## pre2.json

`node tools/build-wordlist.mjs` で上の CSV から生成する対象語リスト。
CEFR-J の A2・B1・B2 のうち、A1 にも載っている語と、数詞・代名詞などを除いたもの。各語に level が付く。

英検の公式リストではない。「A1 ≒ 3級まで、A2〜B1 ≒ 準2級〜2級、B2 ≒ 準1級」という目安による自前の選定。
