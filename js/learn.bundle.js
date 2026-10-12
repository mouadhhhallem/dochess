/* GENERATED FILE — do not edit.
 * js/learn.bundle.js — Learn curriculum + level runtime as one classic script.
 * Source: js/{storage,lessons,engine,board,learn}.js + data/lessons.json
 * Rebuild: node tools/build-learn.mjs      Verify: node tools/build-learn.mjs --check
 * Classic (non-module) on purpose: runs from file:// and inside the meta-CSP. */
(function (global) {
'use strict';

const __mods = Object.create(null);
function __def(id, factory) { __mods[id] = { factory: factory, exports: null, inited: false }; }
function __req(id) {
    const m = __mods[id];
    if (!m) throw new Error('learn bundle: missing module "' + id + '"');
    if (!m.inited) { m.inited = true; m.exports = m.factory(); }
    return m.exports;
}

/* Curriculum inlined: file:// has no fetch(), and it removes a network round-trip. */
global.__DOCHESS_LESSONS__ = {"version":2,"stages":[{"n":1,"title":{"en":"The board and the pieces","fr":"L'échiquier et les pièces","ar":"الرقعة والقطع"},"desc":{"en":"How each piece moves. Land on stars, capture targets — fewer moves, more points.","fr":"Comment chaque pièce se déplace. Atteignez les étoiles, capturez les cibles — moins de coups, plus de points.","ar":"كيف تتحرك كل قطعة. اجمع النجوم والتقط القطع — كلما قلّت النقلات زادت النقاط."}},{"n":2,"title":{"en":"Special moves","fr":"Coups spéciaux","ar":"النقلات الخاصة"},"desc":{"en":"Castling, en passant, and promotion — the moves that surprise beginners.","fr":"Roque, prise en passant et promotion — les coups qui surprennent.","ar":"التحصين والأخذ في المرور والترقية — نقلات تفاجئ المبتدئين."}},{"n":3,"title":{"en":"Check, checkmate & stalemate","fr":"Échec, mat et patt","ar":"الكش والكش مات والتعادل بالجمود"},"desc":{"en":"Attack the king: check, the game-ending checkmate, and the drawing stalemate.","fr":"Attaquez le roi : échec, mat et patt.","ar":"هاجم الملك: الكش والكش مات والجمود."}},{"n":4,"title":{"en":"Tactics","fr":"Tactiques","ar":"الاشتباكات التكتيكية"},"desc":{"en":"Win material with hanging pieces, pins, and discovered attacks.","fr":"Gagnez du matériel avec les pièces pendantes, les pins et les attaques découvertes.","ar":"اربح القطع عبر القطع المعلقة والتثبيت والهجوم المكتشف."}},{"n":5,"title":{"en":"Strategy","fr":"Stratégie","ar":"الاستراتيجية"},"desc":{"en":"Develop pieces, fight for the center, place rooks well, push pawns.","fr":"Développez vos pièces, luttez pour le centre, placez vos tours, poussez vos pions.","ar":"طوّر قطعك وسيطر على المركز ووضع الرخوص وأبعد البيادق."}},{"n":6,"title":{"en":"Endgames","fr":"Finales","ar":"النهايات"},"desc":{"en":"King + pawn, rook endings, and how to save a lost game.","fr":"Roi + pion, finales de tours, et comment sauver une partie perdue.","ar":"الملك والبيدق ونهايات الرخوص وكيف تُنقذ لعبة خاسرة."}}],"sets":[{"id":"s1-rook","stage":1,"icon":"rook","title":{"en":"Rook","fr":"Tour","ar":"الرخ"},"desc":{"en":"Straight lines, any distance — land on every star.","fr":"Lignes droites, n’importe quelle distance.","ar":"خطوط مستقيمة بأي مسافة."}},{"id":"s1-bishop","stage":1,"icon":"bishop","title":{"en":"Bishop","fr":"Fou","ar":"الفيل"},"desc":{"en":"Diagonals forever — one color, endless reach.","fr":"Les diagonales à l’infini.","ar":"قطرات لا تنتهي — لون واحد ونطاق واسع."}},{"id":"s1-queen","stage":1,"icon":"queen","title":{"en":"Queen","fr":"Dame","ar":"الوزير"},"desc":{"en":"Rook + bishop in one — the most powerful piece.","fr":"Tour et fou en un.","ar":"رخ وفيل في قطعة واحدة."}},{"id":"s1-king","stage":1,"icon":"king","title":{"en":"King","fr":"Roi","ar":"الملك"},"desc":{"en":"One square at a time — but it rules the board.","fr":"Une case à la fois.","ar":"مربع واحد في كل نقلة."}},{"id":"s1-knight","stage":1,"icon":"knight","title":{"en":"Knight","fr":"Cavalier","ar":"الحصان"},"desc":{"en":"The L-jumper — the only piece that leaps.","fr":"Le cavalier qui saute.","ar":"القطعة الوحيدة التي تقفز."}},{"id":"s1-pawn","stage":1,"icon":"pawn","title":{"en":"Pawn","fr":"Pion","ar":"البيدق"},"desc":{"en":"Small but mighty — captures diagonally, promotes to anything.","fr":"Petit mais costaud.","ar":"صغير لكنه قوي."}},{"id":"s2-castle","stage":2,"icon":"castle","title":{"en":"Castling","fr":"Roque","ar":"التحصين"},"desc":{"en":"One move that guards the king and activates a rook.","fr":"Un coup pour protéger le roi.","ar":"نقلة واحدة تحمي الملك وتحرّك الرخ."}},{"id":"s2-ep","stage":2,"icon":"ep","title":{"en":"En passant","fr":"Prise en passant","ar":"الأخذ في المرور"},"desc":{"en":"Capture a pawn the instant it tries to slip past.","fr":"Capturez le pion au passage.","ar":"التقط البيدق لحظة عبوره."}},{"id":"s2-promo","stage":2,"icon":"crown","title":{"en":"Promotion","fr":"Promotion","ar":"الترقية"},"desc":{"en":"A pawn on the last rank becomes any piece.","fr":"Le pion devient n'importe quelle pièce.","ar":"البيدق في الرتبة الأخيرة يصبح أي قطعة."}},{"id":"s3-check","stage":3,"icon":"target","title":{"en":"Check","fr":"Échec","ar":"الكش"},"desc":{"en":"Attack the king — it must respond at once.","fr":"Attaquez le roi : réponse obligée.","ar":"هاجم الملك — لا بد من الرد فورًا."}},{"id":"s3-mate","stage":3,"icon":"mated","title":{"en":"Checkmate","fr":"Échec et mat","ar":"الكش مات"},"desc":{"en":"Check with no escape — the game ends.","fr":"Échec sans échappatoire.","ar":"كش بلا مخرج — تنتهي اللعبة."}},{"id":"s3-draw","stage":3,"icon":"flag","title":{"en":"Stalemate","fr":"Patt","ar":"الجمود"},"desc":{"en":"No moves, no check — half a point saved.","fr":"Pas de coup, pas d’échec.","ar":"لا نقلات ولا كش — يُنقذ نصف نقطة."}},{"id":"s4-hang","stage":4,"icon":"swords","title":{"en":"Hanging pieces","fr":"Pièces pendantes","ar":"القطع المعلقة"},"desc":{"en":"Undefended enemy pieces are free material.","fr":"Les pièces non défendues sont gratuites.","ar":"القطع غير المحمية مادة مجانية."}},{"id":"s4-pin","stage":4,"icon":"shield","title":{"en":"Pins","fr":"Pins","ar":"التثبيت"},"desc":{"en":"Trap a piece against something precious behind it.","fr":"Immobilisez une pièce.","ar":"ثبّت قطعة أمام قطعة ثمينة."}},{"id":"s4-plan","stage":4,"icon":"sunrise","title":{"en":"Coming soon","fr":"Bientôt","ar":"قريبًا"},"desc":{"en":"Skewers, forks, deflection & more — lessons in the workshop.","fr":"Pions fourchus, déflections…","ar":"التحاميل والشوك والتشتيت — قيد الإعداد."}},{"id":"s5-dev","stage":5,"icon":"sunrise","title":{"en":"Development","fr":"Développement","ar":"التطوير"},"desc":{"en":"Wake your pieces up before the fight begins.","fr":"Réveillez vos pièces.","ar":"أيقظ قطعك قبل بدء القتال."}},{"id":"s5-center","stage":5,"icon":"target","title":{"en":"The center","fr":"Le centre","ar":"المركز"},"desc":{"en":"Central pawns = space, scope, and options.","fr":"Pions centraux = espace.","ar":"بيادق المركز = مساحة ونطاق."}},{"id":"s5-rook","stage":5,"icon":"rook","title":{"en":"Rook play","fr":"Jeu de tours","ar":"لعب الرخوص"},"desc":{"en":"Open files and the 7th rank — rook highways.","fr":"Fiches ouvertes et 7e rangée.","ar":"الخطوط المفتوحة والرتبة السابعة."}},{"id":"s5-pawn","stage":5,"icon":"pawn","title":{"en":"Pawn play","fr":"Jeu de pions","ar":"لعب البيادق"},"desc":{"en":"Passed pawns race to promotion.","fr":"Les pions passants courent à la promotion.","ar":"البيادق المارّة تنطلق نحو الترقية."}},{"id":"s5-king","stage":5,"icon":"king","title":{"en":"King activity","fr":"Activité du roi","ar":"نشاط الملك"},"desc":{"en":"In the endgame, the king joins the attack.","fr":"En finale, le roi se bat.","ar":"في النهاية يشارك الملك في القتال."}},{"id":"s6-kp","stage":6,"icon":"crown","title":{"en":"King + pawn","fr":"Roi + pion","ar":"الملك والبيدق"},"desc":{"en":"Push the passed pawn home — the simplest win.","fr":"Poussez le pion passé.","ar":"ادفع البيدق المار إلى النهاية."}},{"id":"s6-rook","stage":6,"icon":"rook","title":{"en":"Rook endings","fr":"Finales de tours","ar":"نهايات الرخوص"},"desc":{"en":"Activity rules: hunt pawns, deliver the ladder mate.","fr":"L'activité domine.","ar":"النشاط هو الأهم: اصطد البيادق وأكمل السلّم."}},{"id":"s6-draw","stage":6,"icon":"flag","title":{"en":"Drawing techniques","fr":"Techniques nulles","ar":"طرق التعادل"},"desc":{"en":"Stalemate tricks to save lost games.","fr":"Sauvez des parties perdues.","ar":"حيل الجمود لإنقاذ الألعاب الخاسرة."}}],"levels":[{"id":"s1r-1","stage":1,"group":"rook","themes":["rook","movement"],"mode":"free-move","type":"free-move","title":{"en":"Rook: straight lines","fr":"Tour : lignes droites","ar":"الرخ: خطوط مستقيمة"},"intro":{"en":"The rook moves in straight lines. Land on every star — the fewer moves you make, the more points you win!","fr":"La tour se déplace en ligne droite. Atteignez chaque étoile — moins de coups, plus de points !","ar":"يتحرك الرخ في خطوط مستقيمة. قف على كل نجمة — كلما قلّت نقلاتك زادت نقاطك!"},"goalText":{"en":"Collect all 3 stars with the rook.","fr":"Ramassez les 3 étoiles avec la tour.","ar":"اجمع النجوم الثلاث بالرخ."},"fen":"4k3/8/8/8/8/8/8/R3K3 w - - 0 1","movePieces":["r"],"goal":{"collect":["a4","a6","a8"]},"par":3,"maxMoves":8,"hints":[{"en":"Rooks travel any number of empty squares, straight only.","fr":"La tour parcourt autant de cases vides qu'elle veut, en ligne droite.","ar":"يقطع الرخ أي عدد من المربعات الفارغة في خط مستقيم."},{"en":"The whole a-file is empty — climb it star by star.","fr":"Toute la colonne a est vide — montez étoile par étoile.","ar":"العمود a فارغ تمامًا — اصعده نجمةً نجمة."},{"en":"Play a4, then a6, then a8.","fr":"Jouez a4, puis a6, puis a8.","ar":"العب a4 ثم a6 ثم a8."}],"explain":{"en":"One star per landing: passing over a star does not collect it.","fr":"Une étoile par arrivée : passer au-dessus ne suffit pas.","ar":"نجمة واحدة عند الوقوف: المرور فوق النجمة لا يجمعها."},"success":{"en":"3 stars in 3 moves — perfect rook control!","fr":"3 étoiles en 3 coups — contrôle parfait !","ar":"٣ نجوم في ٣ نقلات — سيطرة مثالية!"},"failHint":{"en":"Count your landings: each star needs its own stop.","fr":"Comptez vos arrivées : chaque étoile demande son arrêt.","ar":"احسب وقفاتك: كل نجمة تحتاج توقفًا."},"xp":10,"set":"s1-rook","difficulty":2},{"id":"s1r-2","stage":1,"group":"rook","themes":["rook","movement"],"mode":"free-move","type":"free-move","title":{"en":"Rook: change direction","fr":"Tour : changer de direction","ar":"الرخ: تغيير الاتجاه"},"goalText":{"en":"Collect all 3 stars. Your own king blocks the first rank!","fr":"Ramassez les 3 étoiles. Votre propre roi bloque la première rangée !","ar":"اجمع النجوم الثلاث. ملكك يعترض الصف الأول!"},"fen":"8/8/6k1/8/8/8/8/R3K3 w - - 0 1","movePieces":["r"],"goal":{"collect":["a8","h8","h1"]},"par":3,"maxMoves":8,"hints":[{"en":"Your king on e1 blocks sliding along rank 1.","fr":"Votre roi en e1 bloque le passage sur la rangée 1.","ar":"ملكك في e1 يسد الطريق على الصف الأول."},{"en":"Go up the a-file first, then turn.","fr":"Montez d'abord la colonne a, puis tournez.","ar":"اصعد العمود a أولًا ثم انعطف."},{"en":"Play a8, h8, h1.","fr":"Jouez a8, h8, h1.","ar":"العب a8 ثم h8 ثم h1."}],"explain":{"en":"Rooks turn corners by combining two straight slides. Friendly pieces block too.","fr":"La tour tourne en combinant deux glissades droites. Les pièces amies bloquent aussi.","ar":"ينعطف الرخ بجمع حركتين مستقيمتين. القطع الصديقة تعترض أيضًا."},"success":{"en":"Three corners turned — the rook dances!","fr":"Trois virages — la tour danse !","ar":"ثلاثة انعطافات — الرخ يرقص!"},"failHint":{"en":"The e1 king forces the a-file route. Up, across, down.","fr":"Le roi e1 impose la colonne a. Haut, traversée, bas.","ar":"ملك e1 يفرض طريق العمود a. اصعد ثم اعبر ثم انزل."},"xp":10,"set":"s1-rook","difficulty":2},{"id":"s1r-3","stage":1,"group":"rook","themes":["rook","blocked-path"],"mode":"free-move","type":"free-move","title":{"en":"Rook: blocked path","fr":"Tour : passage bloqué","ar":"الرخ: طريق مسدود"},"goalText":{"en":"Your pawn on a6 blocks the file. Collect both stars anyway.","fr":"Votre pion en a6 bloque la colonne. Ramassez les étoiles quand même.","ar":"بيدقك في a6 يسد العمود. اجمع النجمتين رغم ذلك."},"fen":"8/7k/P7/8/8/8/8/R3K3 w - - 0 1","movePieces":["r"],"goal":{"collect":["a4","a8"]},"par":4,"maxMoves":10,"hints":[{"en":"The a6 pawn splits the file in two — detour around it.","fr":"Le pion a6 coupe la colonne en deux — contournez-le.","ar":"البيدق a6 يقسم العمود — التفّ حوله."},{"en":"Collect a4 first, then leave the file sideways.","fr":"Prenez a4 d'abord, puis quittez la colonne.","ar":"اجمع a4 أولًا ثم اخرج من العمود جانبًا."},{"en":"Play a4, e4, e8, a8.","fr":"Jouez a4, e4, e8, a8.","ar":"العب a4 ثم e4 ثم e8 ثم a8."}],"explain":{"en":"When the direct road is blocked, a rook goes around the obstacle in a rectangle.","fr":"Quand la route directe est bloquée, la tour contourne l'obstacle en rectangle.","ar":"عندما يُسد الطريق المباشر يلتف الرخ حول العائق مستطيلًا."},"success":{"en":"Detour mastered — blockers are just puzzles!","fr":"Détour maîtrisé — les bloqueurs ne sont que des énigmes !","ar":"أتقنت الالتفاف — العوائق مجرد ألغاز!"},"failHint":{"en":"a6 can't be crossed. Rectangle: out, up, back.","fr":"a6 est infranchissable. Rectangle : sortie, montée, retour.","ar":"لا يمكن عبور a6. مستطيل: اخرج ثم اصعد ثم عُد."},"xp":15,"set":"s1-rook","difficulty":3},{"id":"s1r-4","stage":1,"group":"rook","themes":["rook","capture"],"mode":"free-move","type":"free-move","title":{"en":"Rook: capture the pawns","fr":"Tour : capturez les pions","ar":"الرخ: التقط البيادق"},"goalText":{"en":"Capture all 3 black pawns.","fr":"Capturez les 3 pions noirs.","ar":"التقط البيادق السوداء الثلاثة."},"fen":"1k2p3/8/8/p3p3/8/8/8/R3K3 w - - 0 1","movePieces":["r"],"goal":{"capture":["a5","e5","e8"]},"par":3,"maxMoves":8,"hints":[{"en":"Rooks capture exactly like they move: land on the enemy.","fr":"La tour capture comme elle se déplace : en arrivant sur l'ennemi.","ar":"يلتقط الرخ كما يتحرك: بالوقوف على العدو."},{"en":"Start with the closest pawn, a5.","fr":"Commencez par le pion le plus proche, a5.","ar":"ابدأ بالبيدق الأقرب a5."},{"en":"Play axa5, a5–e5, exxe8.","fr":"Jouez axa5, a5–e5, exxe8.","ar":"العب axa5 ثم a5–e5 ثم exxe8."}],"explain":{"en":"Chain captures along shared lines: each capture lands you lined up for the next.","fr":"Enchaînez les captures sur des lignes partagées : chaque prise vous aligne pour la suivante.","ar":"سلسِل الالتقاط على خطوط مشتركة: كل التقاط يضعك على خط التالي."},"success":{"en":"Three pawns swept off the board!","fr":"Trois pions balayés de l'échiquier !","ar":"ثلاثة بيادق كُنسَت عن الرقعة!"},"failHint":{"en":"Follow the chain a5 → e5 → e8.","fr":"Suivez la chaîne a5 → e5 → e8.","ar":"اتبع السلسلة a5 ← e5 ← e8."},"xp":15,"set":"s1-rook","difficulty":2},{"id":"s1r-5","stage":1,"group":"rook","themes":["rook","obstacles"],"mode":"free-move","type":"free-move","title":{"en":"Rook: forbidden squares","fr":"Tour : cases interdites","ar":"الرخ: مربعات ممنوعة"},"goalText":{"en":"Reach h8. The marked squares are lava — never cross or land on them.","fr":"Atteignez h8. Les cases marquées sont de la lave — ne les traversez ni n'y arrêtez.","ar":"اصِل إلى h8. المربعات المعلّمة حمم — لا تعبرها ولا تقف عليها."},"fen":"8/8/8/1k6/8/8/8/R3K3 w - - 0 1","movePieces":["r"],"goal":{"collect":["d8","h8"]},"obstacles":["a8","h1"],"par":3,"maxMoves":8,"hints":[{"en":"a8 and h1 are lava. Both 2-move roads use them.","fr":"a8 et h1 sont de la lave. Les deux routes en 2 coups les utilisent.","ar":"a8 وh1 حمم. الطريقان ذات النقلتين يمران بهما."},{"en":"Climb the d-file instead.","fr":"Montez plutôt par la colonne d.","ar":"اصعد من العمود d بدلًا من ذلك."},{"en":"Play d1, d8, h8.","fr":"Jouez d1, d8, h8.","ar":"العب d1 ثم d8 ثم h8."}],"explain":{"en":"Obstacles turn roads off: always re-check which 2-move tries survive.","fr":"Les obstacles ferment des routes : revérifiez quelles tentatives en 2 coups survivent.","ar":"العوائق تغلق الطرق: أعد فحص محاولات النقلتين الناجية."},"success":{"en":"Lava dodged — route planning unlocked!","fr":"Lave évitée — planification débloquée !","ar":"نجوت من الحمم — فتحت تخطيط الطرق!"},"failHint":{"en":"a8 and h1 burn. The d-file road is safe.","fr":"a8 et h1 brûlent. La route de la colonne d est sûre.","ar":"a8 وh1 تحرقان. طريق العمود d آمن."},"xp":15,"set":"s1-rook","difficulty":2},{"id":"s1r-6","stage":1,"group":"rook","themes":["rook","route"],"mode":"free-move","type":"free-move","title":{"en":"Rook: the grand tour","fr":"Tour : le grand tour","ar":"الرخ: الجولة الكبرى"},"goalText":{"en":"Collect all 4 stars. Plan the whole tour before moving!","fr":"Ramassez les 4 étoiles. Planifiez tout le parcours avant de jouer !","ar":"اجمع النجوم الأربع. خطط الجولة كاملة قبل الحركة!"},"fen":"8/8/8/8/K2k4/8/8/R7 w - - 0 1","movePieces":["r"],"goal":{"collect":["h2","b2","b7","h7"]},"par":5,"maxMoves":12,"hints":[{"en":"Four stars, so at least 4 landings — plus getting started.","fr":"Quatre étoiles, donc au moins 4 arrivées — plus le départ.","ar":"أربع نجوم أي أربع وقفات على الأقل — زائد البداية."},{"en":"Sweep the bottom rank, then climb the b-file.","fr":"Balayez la rangée du bas, puis montez la colonne b.","ar":"امسح الصف السفلي ثم اصعد العمود b."},{"en":"One road: h1, h2, b2, b7, h7.","fr":"Une route : h1, h2, b2, b7, h7.","ar":"طريق واحد: h1 ثم h2 ثم b2 ثم b7 ثم h7."}],"explain":{"en":"Shortest routes chain shared lines: each landing sets up the next.","fr":"Les routes les plus courtes enchaînent des lignes partagées : chaque arrivée prépare la suivante.","ar":"أقصر الطرق تسلسل خطوطًا مشتركة: كل وقفة تجهّز التالية."},"success":{"en":"Grand tour in 5 — true rook vision!","fr":"Grand tour en 5 — vraie vision de tour !","ar":"جولة كبرى في ٥ — نظرة رخ حقيقية!"},"failHint":{"en":"Order matters: h2–b2 share a rank, b2–b7 a file, b7–h7 a rank.","fr":"L'ordre compte : h2–b2 partagent une rangée, b2–b7 une colonne, b7–h7 une rangée.","ar":"الترتيب مهم: h2–b2 في صف واحد وb2–b7 في عمود وb7–h7 في صف."},"xp":20,"set":"s1-rook","difficulty":3},{"id":"s1b-1","stage":1,"group":"bishop","themes":["bishop","movement"],"mode":"free-move","type":"free-move","title":{"en":"Bishop: stay on color","fr":"Fou : restez sur la couleur","ar":"الفيل: ابقَ على اللون"},"intro":{"en":"The bishop glides diagonally and never leaves its color. Land on every star — fewer moves, more points!","fr":"Le fou glisse en diagonale et ne quitte jamais sa couleur. Atteignez chaque étoile — moins de coups, plus de points !","ar":"ينزلق الفيل قطريًا ولا يغادر لونه أبدًا. قف على كل نجمة — كلما قلّت نقلاتك زادت نقاطك!"},"goalText":{"en":"Collect both stars with the bishop.","fr":"Ramassez les 2 étoiles avec le fou.","ar":"اجمع النجمتين بالفيل."},"fen":"k7/8/8/8/8/8/8/2B3K1 w - - 0 1","movePieces":["b"],"goal":{"collect":["e3","g5"]},"par":2,"maxMoves":8,"hints":[{"en":"Bishops own diagonals — c1, d2, e3, f4, g5, h6 is one line.","fr":"Les fous règnent sur les diagonales — c1, d2, e3, f4, g5, h6 forment une ligne.","ar":"الفيلة تملك الأقطار — c1 وd2 وe3 وf4 وg5 وh6 خط واحد."},{"en":"Both stars sit on that diagonal.","fr":"Les deux étoiles sont sur cette diagonale.","ar":"النجمتان على هذا القطر."},{"en":"Play e3, then g5 — or g5, then e3.","fr":"Jouez e3, puis g5 — ou g5, puis e3.","ar":"العب e3 ثم g5 — أو g5 ثم e3."}],"explain":{"en":"Landing collects the star; gliding over it does not.","fr":"L'arrivée ramasse l'étoile ; la survoler ne suffit pas.","ar":"الوقوف يجمع النجمة؛ المرور فوقها لا يكفي."},"success":{"en":"Diagonal swept clean!","fr":"Diagonale balayée !","ar":"قطر نظيف تمامًا!"},"failHint":{"en":"Stay on the c1–h6 diagonal: e3 and g5.","fr":"Restez sur la diagonale c1–h6 : e3 et g5.","ar":"ابقَ على قطر c1–h6: e3 وg5."},"xp":10,"set":"s1-bishop","difficulty":2},{"id":"s1b-2","stage":1,"group":"bishop","themes":["bishop","movement"],"mode":"free-move","type":"free-move","title":{"en":"Bishop: two diagonals","fr":"Fou : deux diagonales","ar":"الفيل: قطران"},"goalText":{"en":"Collect all 3 stars across both diagonals.","fr":"Ramassez les 3 étoiles sur les deux diagonales.","ar":"اجمع النجوم الثلاثة على القطرين."},"fen":"k7/8/8/8/8/8/8/2B3K1 w - - 0 1","movePieces":["b"],"goal":{"collect":["b2","a3","e7"]},"par":3,"maxMoves":8,"hints":[{"en":"From c1 the bishop reaches two diagonals: b2–a3 and d2–h6.","fr":"Depuis c1 le fou atteint deux diagonales : b2–a3 et d2–h6.","ar":"من c1 يصل الفيل إلى قطرين: b2–a3 وd2–h6."},{"en":"Clear the short diagonal first.","fr":"Nettoyez d'abord la petite diagonale.","ar":"نظّف القطر القصير أولًا."},{"en":"Play b2, a3, then swing up to e7.","fr":"Jouez b2, a3, puis remontez vers e7.","ar":"العب b2 ثم a3 ثم اصعد إلى e7."}],"explain":{"en":"Every bishop move switches diagonals — plan which diagonal each star needs.","fr":"Chaque coup de fou change de diagonale — prévoyez la diagonale de chaque étoile.","ar":"كل نقلة فيل تغيّر القطر — خطط لقطر كل نجمة."},"success":{"en":"Both diagonals harvested!","fr":"Les deux diagonales récoltées !","ar":"حصدت القطرين!"},"failHint":{"en":"b2 and a3 share one diagonal; e7 needs the long a3–f8 road.","fr":"b2 et a3 partagent une diagonale ; e7 exige la longue route a3–f8.","ar":"b2 وa3 على قطر واحد؛ e7 يحتاج طريق a3–f8 الطويل."},"xp":10,"set":"s1-bishop","difficulty":2},{"id":"s1b-3","stage":1,"group":"bishop","themes":["bishop","blocked-path"],"mode":"free-move","type":"free-move","title":{"en":"Bishop: blocked diagonal","fr":"Fou : diagonale bloquée","ar":"الفيل: قطر مسدود"},"goalText":{"en":"Your pawn on d2 blocks the main diagonal. Collect both stars anyway.","fr":"Votre pion en d2 bloque la grande diagonale. Ramassez les étoiles quand même.","ar":"بيدقك في d2 يسد القطر الرئيسي. اجمع النجمتين رغم ذلك."},"fen":"k7/8/8/8/8/8/3P4/2B3K1 w - - 0 1","movePieces":["b"],"goal":{"collect":["f4","h6"]},"par":4,"maxMoves":10,"hints":[{"en":"d2 is occupied, so c1 can't go right — go left first.","fr":"d2 est occupée, c1 ne peut pas aller à droite — allez à gauche d'abord.","ar":"d2 مشغول فلا يستطيع c1 الذهاب يمينًا — اذهب يسارًا أولًا."},{"en":"The a3–f8 diagonal climbs back to the kingside.","fr":"La diagonale a3–f8 remonte vers l'aile roi.","ar":"قطر a3–f8 يصعد عائدًا إلى جناح الملك."},{"en":"Play a3, f8, h6, then drop to f4.","fr":"Jouez a3, f8, h6, puis redescendez en f4.","ar":"العب a3 ثم f8 ثم h6 ثم انزل إلى f4."}],"explain":{"en":"A blocked diagonal means leaving by the other one and returning from above.","fr":"Une diagonale bloquée impose de sortir par l'autre et de revenir par le haut.","ar":"القطر المسدود يعني الخروج من الآخر والعودة من الأعلى."},"success":{"en":"Blockade outflanked — beautiful detour!","fr":"Blocus contourné — beau détour !","ar":"التفت على الحصار — التفاف جميل!"},"failHint":{"en":"Left, up, across, down: a3, f8, h6, f4.","fr":"Gauche, haut, traversée, bas : a3, f8, h6, f4.","ar":"يسار ثم صعود ثم عبور ثم نزول: a3 وf8 وh6 وf4."},"xp":15,"set":"s1-bishop","difficulty":3},{"id":"s1b-4","stage":1,"group":"bishop","themes":["bishop","capture"],"mode":"free-move","type":"free-move","title":{"en":"Bishop: capture the pawns","fr":"Fou : capturez les pions","ar":"الفيل: التقط البيادق"},"goalText":{"en":"Capture all 3 black pawns.","fr":"Capturez les 3 pions noirs.","ar":"التقط البيادق السوداء الثلاثة."},"fen":"k7/8/8/6p1/8/4p3/1p6/2B3K1 w - - 0 1","movePieces":["b"],"goal":{"capture":["b2","e3","g5"]},"par":4,"maxMoves":10,"hints":[{"en":"Captures land you on new diagonals — chain them.","fr":"Les captures vous posent sur de nouvelles diagonales — enchaînez-les.","ar":"الالتقاط يضعك على أقطار جديدة — سلسِلها."},{"en":"The b2 pawn is closest to home.","fr":"Le pion b2 est le plus proche.","ar":"بيدق b2 هو الأقرب."},{"en":"Play xbxb2, back to c1, xxe3, xxg5.","fr":"Jouez xbxb2, retour en c1, xxe3, xxg5.","ar":"العب xbxb2 ثم عُد إلى c1 ثم xxe3 ثم xxg5."}],"explain":{"en":"Each capture is also a redeployment onto the next diagonal.","fr":"Chaque capture est aussi un redéploiement sur la diagonale suivante.","ar":"كل التقاط هو أيضًا إعادة انتشار على القطر التالي."},"success":{"en":"Three pawns picked off the diagonals!","fr":"Trois pions cueillis sur les diagonales !","ar":"ثلاثة بيادق قُطفت من الأقطار!"},"failHint":{"en":"Order: b2 first, swing home, then climb e3–g5.","fr":"Ordre : b2 d'abord, retour, puis montée e3–g5.","ar":"الترتيب: b2 أولًا ثم العودة ثم الصعود e3–g5."},"xp":15,"set":"s1-bishop","difficulty":3},{"id":"s1b-5","stage":1,"group":"bishop","themes":["bishop","obstacles"],"mode":"free-move","type":"free-move","title":{"en":"Bishop: the lava diagonal","fr":"Fou : la diagonale de lave","ar":"الفيل: قطر الحمم"},"goalText":{"en":"g5 is lava — it blocks the direct road to h6. Collect all 3 stars.","fr":"g5 est de la lave — elle bloque la route directe vers h6. Ramassez les 3 étoiles.","ar":"g5 حمم — تسد الطريق المباشر إلى h6. اجمع النجوم الثلاث."},"fen":"k7/8/8/8/8/8/8/2B3K1 w - - 0 1","movePieces":["b"],"goal":{"collect":["b2","a3","h6"]},"obstacles":["g5"],"par":4,"maxMoves":10,"hints":[{"en":"c1–h6 crosses g5, which burns. Go the long way round.","fr":"c1–h6 traverse g5, qui brûle. Faites le grand tour.","ar":"c1–h6 يعبر g5 الحارقة. سِر الطريق الطويل."},{"en":"Grab b2 and a3 on the way out.","fr":"Prenez b2 et a3 en sortant.","ar":"اجمع b2 وa3 في طريقك للخارج."},{"en":"Play b2, a3, f8, h6.","fr":"Jouez b2, a3, f8, h6.","ar":"العب b2 ثم a3 ثم f8 ثم h6."}],"explain":{"en":"One blocked square can force a three-diagonal journey.","fr":"Une seule case bloquée peut imposer un voyage en trois diagonales.","ar":"مربع مسدود واحد قد يفرض رحلة بثلاثة أقطار."},"success":{"en":"Lava crossed safely — detour expert!","fr":"Lave traversée sans dommage — expert du détour !","ar":"عبرت الحمم بسلام — خبير الالتفاف!"},"failHint":{"en":"Never touch g5: b2, a3, f8, h6.","fr":"Ne touchez jamais g5 : b2, a3, f8, h6.","ar":"لا تلمس g5 أبدًا: b2 ثم a3 ثم f8 ثم h6."},"xp":15,"set":"s1-bishop","difficulty":3},{"id":"s1b-6","stage":1,"group":"bishop","themes":["bishop","route"],"mode":"free-move","type":"free-move","title":{"en":"Bishop: the grand diagonal tour","fr":"Fou : le grand tour des diagonales","ar":"الفيل: الجولة القطرية الكبرى"},"goalText":{"en":"Collect all 4 stars. Plan the whole tour first!","fr":"Ramassez les 4 étoiles. Planifiez tout le parcours d'abord !","ar":"اجمع النجوم الأربع. خطط الجولة كاملة أولًا!"},"fen":"k7/8/8/8/8/8/8/2B3K1 w - - 0 1","movePieces":["b"],"goal":{"collect":["f4","h6","a3","e7"]},"par":5,"maxMoves":12,"hints":[{"en":"Four stars on two clusters: the c1 side and the a3 side.","fr":"Quatre étoiles en deux groupes : côté c1 et côté a3.","ar":"أربع نجوم في مجموعتين: جهة c1 وجهة a3."},{"en":"Finish one cluster before crossing to the other.","fr":"Terminez un groupe avant de passer à l'autre.","ar":"أنهِ مجموعة قبل العبور إلى الأخرى."},{"en":"One road: f4, h6, c1, a3, e7.","fr":"Une route : f4, h6, c1, a3, e7.","ar":"طريق واحد: f4 ثم h6 ثم c1 ثم a3 ثم e7."}],"explain":{"en":"Cluster your targets: crossings between clusters cost extra moves.","fr":"Regroupez vos cibles : les traversées entre groupes coûtent des coups.","ar":"جمّع أهدافك: العبور بين المجموعات يكلّف نقلات."},"success":{"en":"Grand tour in 5 — diagonal mastery!","fr":"Grand tour en 5 — maîtrise des diagonales !","ar":"جولة كبرى في ٥ — إتقان الأقطار!"},"failHint":{"en":"f4–h6 share a road, a3–e7 share one. Cross once, in c1.","fr":"f4–h6 partagent une route, a3–e7 aussi. Traversez une fois, en c1.","ar":"f4–h6 على طريق واحد وa3–e7 كذلك. اعبر مرة واحدة عبر c1."},"xp":20,"set":"s1-bishop","difficulty":3},{"id":"s1q-1","stage":1,"group":"queen","themes":["queen","movement"],"mode":"free-move","type":"free-move","title":{"en":"Queen: the strong file","fr":"Dame : la colonne forte","ar":"الملكة: العمود القوي"},"intro":{"en":"The queen moves like a rook PLUS a bishop. Land on every star — the fewer moves, the more points!","fr":"La dame se déplace comme une tour PLUS un fou. Atteignez chaque étoile — moins de coups, plus de points !","ar":"تتحرك الملكة مثل الرخ والفيل معًا. قف على كل نجمة — كلما قلّت نقلاتك زادت نقاطك!"},"goalText":{"en":"Collect all 3 stars with the queen.","fr":"Ramassez les 3 étoiles avec la dame.","ar":"اجمع النجوم الثلاث بالملكة."},"fen":"7k/8/8/8/8/8/8/3QK3 w - - 0 1","movePieces":["q"],"goal":{"collect":["d4","d6","d8"]},"par":3,"maxMoves":8,"hints":[{"en":"The whole d-file is empty.","fr":"Toute la colonne d est vide.","ar":"العمود d فارغ تمامًا."},{"en":"Climb it star by star.","fr":"Montez étoile par étoile.","ar":"اصعده نجمةً نجمة."},{"en":"Play d4, d6, d8.","fr":"Jouez d4, d6, d8.","ar":"العب d4 ثم d6 ثم d8."}],"explain":{"en":"Queen power means options — but one star still needs one landing.","fr":"La puissance de la dame offre des options — mais chaque étoile exige son arrivée.","ar":"قوة الملكة تعني خيارات — لكن كل نجمة تحتاج وقفة."},"success":{"en":"Majestic climb — 3 for 3!","fr":"Montée majestueuse — 3 sur 3 !","ar":"صعود مهيب — ٣ من ٣!"},"failHint":{"en":"Straight up the d-file: d4, d6, d8.","fr":"Tout droit sur la colonne d : d4, d6, d8.","ar":"مباشرة في العمود d: d4 ثم d6 ثم d8."},"xp":10,"set":"s1-queen","difficulty":2},{"id":"s1q-2","stage":1,"group":"queen","themes":["queen","movement"],"mode":"free-move","type":"free-move","title":{"en":"Queen: rook and bishop in one","fr":"Dame : tour et fou en une","ar":"الملكة: رخ وفيل معًا"},"goalText":{"en":"Collect all 3 stars using both queen powers.","fr":"Ramassez les 3 étoiles en utilisant les deux pouvoirs.","ar":"اجمع النجوم الثلاث باستخدام القوتين."},"fen":"4k3/8/8/8/8/8/8/3QK3 w - - 0 1","movePieces":["q"],"goal":{"collect":["h5","a5","a8"]},"par":3,"maxMoves":8,"hints":[{"en":"Start with the bishop-move: the d1–h5 diagonal.","fr":"Commencez par le coup de fou : la diagonale d1–h5.","ar":"ابدأ بحركة الفيل: قطر d1–h5."},{"en":"Then slide like a rook along rank 5 and file a.","fr":"Puis glissez comme une tour sur la rangée 5 et la colonne a.","ar":"ثم انزلق كالرخ على الصف الخامس والعمود a."},{"en":"Play h5, a5, a8.","fr":"Jouez h5, a5, a8.","ar":"العب h5 ثم a5 ثم a8."}],"explain":{"en":"Diagonal, rank, file — one tour uses every queen power.","fr":"Diagonale, rangée, colonne — un parcours utilise tous les pouvoirs.","ar":"قطر وصف وعمود — جولة واحدة تستخدم كل القوى."},"success":{"en":"Full powers unleashed!","fr":"Pleins pouvoirs déchaînés !","ar":"أُطلقت كل القوى!"},"failHint":{"en":"Bishop first (h5), then rook slides (a5, a8).","fr":"Fou d'abord (h5), puis glissades de tour (a5, a8).","ar":"الفيل أولًا (h5) ثم انزلاقات الرخ (a5 وa8)."},"xp":10,"set":"s1-queen","difficulty":2},{"id":"s1q-3","stage":1,"group":"queen","themes":["queen","blocked-path"],"mode":"free-move","type":"free-move","title":{"en":"Queen: blocked file","fr":"Dame : colonne bloquée","ar":"الملكة: عمود مسدود"},"goalText":{"en":"Your pawn on d4 blocks the file. Collect both stars anyway.","fr":"Votre pion en d4 bloque la colonne. Ramassez les étoiles quand même.","ar":"بيدقك في d4 يسد العمود. اجمع النجمتين رغم ذلك."},"fen":"7k/8/8/8/3P4/8/8/3QK3 w - - 0 1","movePieces":["q"],"goal":{"collect":["d6","d8"]},"par":4,"maxMoves":10,"hints":[{"en":"d4 is occupied, so leave the file and come back from above.","fr":"d4 est occupée : quittez la colonne et revenez par le haut.","ar":"d4 مشغول: اخرج من العمود وعُد من الأعلى."},{"en":"The h5 square starts a road back to d5.","fr":"La case h5 ouvre une route vers d5.","ar":"المربع h5 يفتح طريقًا إلى d5."},{"en":"Play h5, d5, d6, d8.","fr":"Jouez h5, d5, d6, d8.","ar":"العب h5 ثم d5 ثم d6 ثم d8."}],"explain":{"en":"Queens detour like rooks when blocked — out, across, up, back.","fr":"Bloquée, la dame contourne comme une tour — sortie, traversée, montée, retour.","ar":"عند الانسداد تلتف الملكة كالرخ — خروج وعبور وصعود وعودة."},"success":{"en":"Blockade dissolved in 4!","fr":"Blocus dissous en 4 !","ar":"تبدد الحصار في ٤!"},"failHint":{"en":"Around, not through: h5, d5, d6, d8.","fr":"Autour, pas à travers : h5, d5, d6, d8.","ar":"حوله لا خلاله: h5 ثم d5 ثم d6 ثم d8."},"xp":15,"set":"s1-queen","difficulty":3},{"id":"s1q-4","stage":1,"group":"queen","themes":["queen","capture"],"mode":"free-move","type":"free-move","title":{"en":"Queen: the hunting chain","fr":"Dame : la chaîne de chasse","ar":"الملكة: سلسلة الصيد"},"goalText":{"en":"Capture all 3 black pawns. Your g4 pawn guards the shortcut.","fr":"Capturez les 3 pions noirs. Votre pion g4 garde le raccourci.","ar":"التقط البيادق السوداء الثلاثة. بيدقك g4 يحرس الطريق المختصر."},"fen":"1k6/3p4/8/3p3p/6P1/8/8/3QK3 w - - 0 1","movePieces":["q"],"goal":{"capture":["d5","d7","h5"]},"par":4,"maxMoves":10,"hints":[{"en":"The d1–h5 diagonal is guarded by your own g4 pawn.","fr":"La diagonale d1–h5 est gardée par votre propre pion g4.","ar":"قطر d1–h5 يحرسه بيدقك g4."},{"en":"Climb the d-file eating as you go.","fr":"Montez la colonne d en mangeant au passage.","ar":"اصعد العمود d آكلًا في طريقك."},{"en":"Play xd5, xd7, h7, xxh5.","fr":"Jouez xd5, xd7, h7, xxh5.","ar":"العب xd5 ثم xd7 ثم h7 ثم xxh5."}],"explain":{"en":"Even queens take the stairs when the elevator is guarded.","fr":"Même les dames prennent l'escalier quand l'ascenseur est gardé.","ar":"حتى الملكات تصعد الدرج عندما يكون المصعد محروسًا."},"success":{"en":"Three pawns hunted down!","fr":"Trois pions chassés !","ar":"ثلاثة بيادق اصطيدت!"},"failHint":{"en":"Up the file first: d5, d7, then swing to h5.","fr":"D'abord la colonne : d5, d7, puis vers h5.","ar":"العمود أولًا: d5 ثم d7 ثم نحو h5."},"xp":15,"set":"s1-queen","difficulty":3},{"id":"s1q-5","stage":1,"group":"queen","themes":["queen","obstacles"],"mode":"free-move","type":"free-move","title":{"en":"Queen: three roads closed","fr":"Dame : trois routes fermées","ar":"الملكة: ثلاث طرق مغلقة"},"goalText":{"en":"Reach h8. Three 2-move roads are lava — find the 3-move road.","fr":"Atteignez h8. Trois routes en 2 coups sont de la lave — trouvez celle en 3 coups.","ar":"اصِل إلى h8. ثلاثة طرق بنقلتين حمم — جد طريق النقلات الثلاث."},"fen":"8/k7/8/8/8/8/8/3QK3 w - - 0 1","movePieces":["q"],"goal":{"collect":["h8"]},"obstacles":["h1","d8","h5","g7"],"par":3,"maxMoves":8,"hints":[{"en":"h1, d8 and h5 each kill one 2-move road.","fr":"h1, d8 et h5 tuent chacune une route en 2 coups.","ar":"h1 وd8 وh5 تقتل كل منها طريق نقلتين."},{"en":"The a-file road survives.","fr":"La route de la colonne a survit.","ar":"طريق العمود a ناجٍ."},{"en":"Play a1, a8, h8.","fr":"Jouez a1, a8, h8.","ar":"العب a1 ثم a8 ثم h8."}],"explain":{"en":"Eliminate the blocked roads first; the survivor is your route.","fr":"Éliminez d'abord les routes bloquées ; la survivante est votre route.","ar":"استبعد الطرق المسدودة أولًا؛ الناجي هو طريقك."},"success":{"en":"Only road home found!","fr":"Seule route trouvée !","ar":"وجدت الطريق الوحيد!"},"failHint":{"en":"h1, d8, h5 burn — go a1, a8, h8.","fr":"h1, d8, h5 brûlent — passez par a1, a8, h8.","ar":"h1 وd8 وh5 تحرق — سِر a1 ثم a8 ثم h8."},"xp":15,"set":"s1-queen","difficulty":2},{"id":"s1q-6","stage":1,"group":"queen","themes":["queen","route"],"mode":"free-move","type":"free-move","title":{"en":"Queen: the royal circuit","fr":"Dame : le circuit royal","ar":"الملكة: الدائرة الملكية"},"goalText":{"en":"Collect all 5 stars in one royal circuit.","fr":"Ramassez les 5 étoiles en un circuit royal.","ar":"اجمع النجوم الخمس في دائرة ملكية واحدة."},"fen":"8/8/8/8/8/2k5/8/3QK3 w - - 0 1","movePieces":["q"],"goal":{"collect":["h5","a5","a8","h8","e8"]},"par":5,"maxMoves":12,"hints":[{"en":"Five stars need five landings — no wasted transit allowed.","fr":"Cinq étoiles exigent cinq arrivées — aucun transit perdu.","ar":"خمس نجوم تحتاج خمس وقفات — لا عبور ضائع."},{"en":"Diagonal out, then sweep the edges home.","fr":"Diagonale de sortie, puis balayez les bords.","ar":"قطر للخروج ثم امسح الحواف عائدًا."},{"en":"One circuit: h5, a5, a8, h8, e8.","fr":"Un circuit : h5, a5, a8, h8, e8.","ar":"دائرة واحدة: h5 ثم a5 ثم a8 ثم h8 ثم e8."}],"explain":{"en":"Five targets, five landings: every move must collect.","fr":"Cinq cibles, cinq arrivées : chaque coup doit ramasser.","ar":"خمسة أهداف وخمس وقفات: كل نقلة يجب أن تجمع."},"success":{"en":"Royal circuit in 5 — flawless!","fr":"Circuit royal en 5 — sans faute !","ar":"دائرة ملكية في ٥ — بلا خطأ!"},"failHint":{"en":"h5–a5–a8–h8–e8: never land empty.","fr":"h5–a5–a8–h8–e8 : ne vous arrêtez jamais à vide.","ar":"h5–a5–a8–h8–e8: لا تقف فارغًا أبدًا."},"xp":20,"set":"s1-queen","difficulty":3},{"id":"s1k-1","stage":1,"group":"king","themes":["king","movement"],"mode":"free-move","type":"free-move","title":{"en":"King: one step at a time","fr":"Roi : un pas à la fois","ar":"الملك: خطوة واحدة كل مرة"},"intro":{"en":"The king moves exactly one square in any direction. Collect the stairs — slow and safe wins!","fr":"Le roi avance d'exactement une case dans toute direction. Ramassez l'escalier — doucement et sûrement !","ar":"يتحرك الملك مربعًا واحدًا فقط في أي اتجاه. اجمع الدرج — البطء والأمان يفوزان!"},"goalText":{"en":"Climb the stairs: collect all 3 stars.","fr":"Montez l'escalier : ramassez les 3 étoiles.","ar":"اصعد الدرج: اجمع النجوم الثلاث."},"fen":"4k3/8/8/8/8/8/8/4K3 w - - 0 1","movePieces":["k"],"goal":{"collect":["e2","e3","e4"]},"par":3,"maxMoves":8,"hints":[{"en":"One square per move — no rushing, even for kings.","fr":"Une case par coup — pas de précipitation, même pour les rois.","ar":"مربع واحد كل نقلة — لا استعجال حتى للملوك."},{"en":"Straight up the e-file.","fr":"Tout droit sur la colonne e.","ar":"مباشرة في العمود e."},{"en":"Play e2, e3, e4.","fr":"Jouez e2, e3, e4.","ar":"العب e2 ثم e3 ثم e4."}],"explain":{"en":"Three stairs, three steps: the king's pace sets the par.","fr":"Trois marches, trois pas : le rythme du roi fixe le par.","ar":"ثلاث درجات وثلاث خطوات: إيقاع الملك يحدد العدد."},"success":{"en":"Steady climb — a careful king lives long!","fr":"Montée tranquille — un roi prudent vit longtemps !","ar":"صعود ثابت — الملك الحذر يعيش طويلًا!"},"failHint":{"en":"Up, up, up: e2, e3, e4.","fr":"Haut, haut, haut : e2, e3, e4.","ar":"اصعد اصعد اصعد: e2 ثم e3 ثم e4."},"xp":10,"set":"s1-king","difficulty":2},{"id":"s1k-2","stage":1,"group":"king","themes":["king","movement"],"mode":"free-move","type":"free-move","title":{"en":"King: around the corner","fr":"Roi : autour du coin","ar":"الملك: حول الزاوية"},"goalText":{"en":"Collect all 3 stars around the corner.","fr":"Ramassez les 3 étoiles autour du coin.","ar":"اجمع النجوم الثلاث حول الزاوية."},"fen":"4k3/8/8/8/8/8/8/4K3 w - - 0 1","movePieces":["k"],"goal":{"collect":["d1","d2","e2"]},"par":3,"maxMoves":8,"hints":[{"en":"The king turns corners one square at a time.","fr":"Le roi tourne les coins une case à la fois.","ar":"ينعطف الملك مربعًا مربعًا."},{"en":"Left, up, right.","fr":"Gauche, haut, droite.","ar":"يسار ثم صعود ثم يمين."},{"en":"Play d1, d2, e2.","fr":"Jouez d1, d2, e2.","ar":"العب d1 ثم d2 ثم e2."}],"explain":{"en":"Kings zigzag: every neighboring square is one move away.","fr":"Les rois zigzaguent : chaque case voisine est à un coup.","ar":"الملوك تتحرك متعرجة: كل مربع مجاور على بعد نقلة."},"success":{"en":"Corner rounded perfectly!","fr":"Virage parfait !","ar":"انعطاف مثالي!"},"failHint":{"en":"d1, then d2, then e2.","fr":"d1, puis d2, puis e2.","ar":"d1 ثم d2 ثم e2."},"xp":10,"set":"s1-king","difficulty":2},{"id":"s1k-3","stage":1,"group":"king","themes":["king","blocked-path"],"mode":"free-move","type":"free-move","title":{"en":"King: the pawn in the way","fr":"Roi : le pion gênant","ar":"الملك: البيدق المعترض"},"goalText":{"en":"Your pawn on e2 blocks the stairs. Reach e4 anyway.","fr":"Votre pion en e2 bloque l'escalier. Atteignez e4 quand même.","ar":"بيدقك في e2 يسد الدرج. اصِل إلى e4 رغم ذلك."},"fen":"4k3/8/8/8/8/8/4P3/4K3 w - - 0 1","movePieces":["k"],"goal":{"collect":["e3","e4"]},"par":3,"maxMoves":8,"hints":[{"en":"e2 is occupied — step around your own pawn.","fr":"e2 est occupée — contournez votre propre pion.","ar":"e2 مشغول — التفّ حول بيدقك."},{"en":"Sidestep to d2 first.","fr":"Écartez-vous en d2 d'abord.","ar":"انحرف إلى d2 أولًا."},{"en":"Play d2, e3, e4.","fr":"Jouez d2, e3, e4.","ar":"العب d2 ثم e3 ثم e4."}],"explain":{"en":"Friendly pieces block too — sidestep and rejoin the road.","fr":"Les pièces amies bloquent aussi — écartez-vous et rejoignez la route.","ar":"القطع الصديقة تعترض أيضًا — انحرف وعُد إلى الطريق."},"success":{"en":"Pawn politely sidestepped!","fr":"Pion poliment contourné !","ar":"التففت حول البيدق بأدب!"},"failHint":{"en":"Around the pawn: d2, e3, e4.","fr":"Autour du pion : d2, e3, e4.","ar":"حول البيدق: d2 ثم e3 ثم e4."},"xp":15,"set":"s1-king","difficulty":2},{"id":"s1k-4","stage":1,"group":"king","themes":["king","capture"],"mode":"free-move","type":"free-move","title":{"en":"King: eat the pawns","fr":"Roi : mangez les pions","ar":"الملك: كُل البيادق"},"goalText":{"en":"Capture both black pawns. Pawns defend each other — take the lonely one first!","fr":"Capturez les deux pions noirs. Les pions se défendent — prenez le solitaire d'abord !","ar":"التقط البيدقين الأسودين. البيادق تحمي بعضها — خذ المنعزل أولًا!"},"fen":"k7/8/8/8/8/5p2/3p4/4K3 w - - 0 1","movePieces":["k"],"goal":{"capture":["d2","f3"]},"par":3,"maxMoves":8,"hints":[{"en":"d2 is undefended — but f3 is watched by no one either. Start close.","fr":"d2 est sans défense — f3 non plus. Commencez près.","ar":"d2 بلا حماية — وf3 أيضًا. ابدأ من القريب."},{"en":"After xd2, step to e3 to reach f3.","fr":"Après xd2, passez par e3 pour atteindre f3.","ar":"بعد xd2 مر عبر e3 لتصل f3."},{"en":"Play xd2, e3, xf3.","fr":"Jouez xd2, e3, xf3.","ar":"العب xd2 ثم e3 ثم xf3."}],"explain":{"en":"Never capture a defended piece with your king — take the free one, then step over.","fr":"Ne capturez jamais une pièce défendue avec le roi — prenez la gratuite, puis avancez.","ar":"لا تلتقط أبدًا قطعة محمية بملكك — خذ الحرة ثم تقدّم."},"success":{"en":"Safe feasts only — royal wisdom!","fr":"Festins sûrs uniquement — sagesse royale !","ar":"ولائم آمنة فقط — حكمة ملكية!"},"failHint":{"en":"xd2 first (it's free), transit e3, then xf3.","fr":"xd2 d'abord (gratuit), transit e3, puis xf3.","ar":"xd2 أولًا (مجاني) ثم عبور e3 ثم xf3."},"xp":15,"set":"s1-king","difficulty":2},{"id":"s1k-5","stage":1,"group":"king","themes":["king","danger"],"mode":"free-move","type":"free-move","title":{"en":"King: danger squares","fr":"Roi : cases dangereuses","ar":"الملك: المربعات الخطرة"},"goalText":{"en":"The bishop covers e2 and f1 — a king may never enter danger. Collect both stars.","fr":"Le fou couvre e2 et f1 — un roi n'entre jamais en danger. Ramassez les étoiles.","ar":"الفيل يغطي e2 وf1 — الملك لا يدخل الخطر أبدًا. اجمع النجمتين."},"fen":"k7/8/8/8/8/3b4/8/4K3 w - - 0 1","movePieces":["k"],"goal":{"collect":["d2","f2"]},"avoidAttacked":true,"par":3,"maxMoves":8,"hints":[{"en":"e2 and f1 are attacked — the level rejects them.","fr":"e2 et f1 sont attaquées — le niveau les refuse.","ar":"e2 وf1 مهددتان — المستوى يرفضهما."},{"en":"Safe roads only: d2 is safe, and so is f2.","fr":"Routes sûres uniquement : d2 est sûre, f2 aussi.","ar":"الطرق الآمنة فقط: d2 آمن وf2 آمن."},{"en":"Play d2, e3, f2 — or f2, e3, d2.","fr":"Jouez d2, e3, f2 — ou f2, e3, d2.","ar":"العب d2 ثم e3 ثم f2 — أو f2 ثم e3 ثم d2."}],"explain":{"en":"Kings never step onto attacked squares — the rule is built into every king move.","fr":"Les rois ne vont jamais sur des cases attaquées — la règle est dans chaque coup de roi.","ar":"الملوك لا تخطو أبدًا على مربعات مهددة — القاعدة في كل حركة ملك."},"success":{"en":"Danger read perfectly — royal safety first!","fr":"Danger lu parfaitement — sécurité royale d'abord !","ar":"قرأت الخطر تمامًا — سلامة الملك أولًا!"},"failHint":{"en":"e2 and f1 burn. Walk d2–e3–f2.","fr":"e2 et f1 brûlent. Marchez d2–e3–f2.","ar":"e2 وf1 تحرقان. امشِ d2–e3–f2."},"xp":15,"set":"s1-king","difficulty":2},{"id":"s1k-6","stage":1,"group":"king","themes":["king","route"],"mode":"free-move","type":"free-move","title":{"en":"King: the royal patrol","fr":"Roi : la patrouille royale","ar":"الملك: الدورية الملكية"},"goalText":{"en":"Patrol all 4 corners of your little square. Plan the loop!","fr":"Patrouillez les 4 coins de votre petit carré. Planifiez la boucle !","ar":"اجُب الزوايا الأربع لمربعك الصغير. خطط الدورة!"},"fen":"4k3/8/8/8/8/8/8/4K3 w - - 0 1","movePieces":["k"],"goal":{"collect":["d1","d2","f2","f1"]},"par":5,"maxMoves":12,"hints":[{"en":"Four corners need four visits plus one crossing.","fr":"Quatre coins exigent quatre visites plus une traversée.","ar":"الزوايا الأربع تحتاج أربع زيارات زائد عبور."},{"en":"Sweep one side, cross over, sweep back.","fr":"Balayez un côté, traversez, revenez.","ar":"امسح جهة ثم اعبر ثم عُد."},{"en":"One loop: d1, d2, e3, f2, f1.","fr":"Une boucle : d1, d2, e3, f2, f1.","ar":"دورة واحدة: d1 ثم d2 ثم e3 ثم f2 ثم f1."}],"explain":{"en":"Crossing between clusters costs a move — minimize crossings.","fr":"Traverser entre groupes coûte un coup — minimisez les traversées.","ar":"العبور بين المجموعات يكلّف نقلة — قلّل العبور."},"success":{"en":"Patrol complete in 5 — every corner salutes!","fr":"Patrouille terminée en 5 — chaque coin salue !","ar":"اكتملت الدورية في ٥ — كل زاوية تحيّي!"},"failHint":{"en":"d1–d2, cross via e3, f2–f1.","fr":"d1–d2, traversez par e3, f2–f1.","ar":"d1–d2 ثم اعبر عبر e3 ثم f2–f1."},"xp":20,"set":"s1-king","difficulty":3},{"id":"s1n-1","stage":1,"group":"knight","themes":["knight","movement"],"mode":"free-move","type":"free-move","title":{"en":"Knight: the L jump","fr":"Cavalier : le saut en L","ar":"الحصان: قفزة L"},"intro":{"en":"The knight jumps in an L and over everything. Collect the stars — fewer jumps, more points!","fr":"Le cavalier saute en L et par-dessus tout. Ramassez les étoiles — moins de sauts, plus de points !","ar":"يقفز الحصان على شكل L وفوق كل شيء. اجمع النجوم — قفزات أقل تعني نقاطًا أكثر!"},"goalText":{"en":"Collect both stars with the knight.","fr":"Ramassez les 2 étoiles avec le cavalier.","ar":"اجمع النجمتين بالحصان."},"fen":"4k3/8/8/8/8/8/8/4K1N1 w - - 0 1","movePieces":["n"],"goal":{"collect":["f3","h4"]},"par":2,"maxMoves":8,"hints":[{"en":"L means two squares one way, one square sideways.","fr":"L signifie deux cases dans un sens, une sur le côté.","ar":"يعني L مربعين في اتجاه ومربعًا جانبًا."},{"en":"From g1, f3 is one L away.","fr":"Depuis g1, f3 est à un L.","ar":"من g1 تبلغ f3 بقفزة L واحدة."},{"en":"Play f3, then h4.","fr":"Jouez f3, puis h4.","ar":"العب f3 ثم h4."}],"explain":{"en":"Each landing must be an L away — count two-plus-one every time.","fr":"Chaque arrivée doit être à un L — comptez deux-plus-un à chaque fois.","ar":"كل وقفة يجب أن تبعد L — احسب اثنين زائد واحد كل مرة."},"success":{"en":"Two clean Ls — the knight's dance begins!","fr":"Deux beaux L — la danse du cavalier commence !","ar":"حرفا L نظيفان — بدأت رقصة الحصان!"},"failHint":{"en":"g1 to f3 to h4 — two Ls.","fr":"g1 vers f3 vers h4 — deux L.","ar":"g1 إلى f3 إلى h4 — حرفا L."},"xp":10,"set":"s1-knight","difficulty":2},{"id":"s1n-2","stage":1,"group":"knight","themes":["knight","movement"],"mode":"free-move","type":"free-move","title":{"en":"Knight: zigzag climb","fr":"Cavalier : montée en zigzag","ar":"الحصان: صعود متعرج"},"goalText":{"en":"Zigzag up the board collecting all 3 stars.","fr":"Montez en zigzag en ramassant les 3 étoiles.","ar":"اصعد متعرجًا جامعًا النجوم الثلاث."},"fen":"4k3/8/8/8/8/8/8/4K1N1 w - - 0 1","movePieces":["n"],"goal":{"collect":["e2","f4","d5"]},"par":3,"maxMoves":8,"hints":[{"en":"Knights zigzag: each jump changes direction.","fr":"Les cavaliers zigzaguent : chaque saut change de direction.","ar":"الحصان يتعرج: كل قفزة تغيّر الاتجاه."},{"en":"e2 is one L from g1.","fr":"e2 est à un L de g1.","ar":"e2 على بعد L واحدة من g1."},{"en":"Play e2, f4, d5.","fr":"Jouez e2, f4, d5.","ar":"العب e2 ثم f4 ثم d5."}],"explain":{"en":"Chain Ls tip-to-tail: the landing square aims the next jump.","fr":"Enchaînez les L bout à bout : l'arrivée vise le saut suivant.","ar":"سلسِل L طرفًا بطرف: مربع الوصول يوجّه القفزة التالية."},"success":{"en":"Zigzag perfect — three landings, three stars!","fr":"Zigzag parfait — trois arrivées, trois étoiles !","ar":"تعرج مثالي — ثلاث وقفات وثلاث نجوم!"},"failHint":{"en":"e2, then f4, then d5.","fr":"e2, puis f4, puis d5.","ar":"e2 ثم f4 ثم d5."},"xp":10,"set":"s1-knight","difficulty":2},{"id":"s1n-3","stage":1,"group":"knight","themes":["knight","blocked-path"],"mode":"free-move","type":"free-move","title":{"en":"Knight: the covered square","fr":"Cavalier : la case couverte","ar":"الحصان: المربع المغطى"},"goalText":{"en":"e2 is covered — knights can't land there. Collect both stars anyway.","fr":"e2 est couverte — impossible d'y atterrir. Ramassez les étoiles quand même.","ar":"e2 مغطى — لا يمكن الوقوف عليه. اجمع النجمتين رغم ذلك."},"fen":"4k3/8/8/8/8/8/8/4K1N1 w - - 0 1","movePieces":["n"],"goal":{"collect":["f3","d4"]},"obstacles":["e2"],"par":2,"maxMoves":8,"hints":[{"en":"Knights jump OVER blockers — only the landing square matters.","fr":"Les cavaliers sautent PAR-DESSUS — seule l'arrivée compte.","ar":"الحصان يقفز فوق العوائق — مربع الوصول وحده يهم."},{"en":"e2 is lava for landing, but f3 is free.","fr":"e2 est de la lave pour atterrir, mais f3 est libre.","ar":"e2 حمم للوقوف لكن f3 حر."},{"en":"Play f3, then d4.","fr":"Jouez f3, puis d4.","ar":"العب f3 ثم d4."}],"explain":{"en":"Nothing blocks a knight mid-jump — obstacles only deny landings.","fr":"Rien ne bloque un cavalier en l'air — les obstacles nient seulement les arrivées.","ar":"لا شيء يعترض الحصان في الهواء — العوائق تمنع الوقوف فقط."},"success":{"en":"Jumped clean over the trouble!","fr":"Sauté par-dessus les ennuis !","ar":"قفزت فوق المتاعب بنظافة!"},"failHint":{"en":"Forget e2 — fly f3, then d4.","fr":"Oubliez e2 — volez vers f3, puis d4.","ar":"انسَ e2 — طِر إلى f3 ثم d4."},"xp":15,"set":"s1-knight","difficulty":2},{"id":"s1n-4","stage":1,"group":"knight","themes":["knight","capture"],"mode":"free-move","type":"free-move","title":{"en":"Knight: the capture ladder","fr":"Cavalier : l'échelle des captures","ar":"الحصان: سلم الالتقاط"},"goalText":{"en":"Capture all 3 black pawns climbing the ladder.","fr":"Capturez les 3 pions noirs en montant l'échelle.","ar":"التقط البيادق السوداء الثلاثة صاعدًا السلم."},"fen":"k7/3p4/8/4p3/8/5p2/8/4K1N1 w - - 0 1","movePieces":["n"],"goal":{"capture":["f3","e5","d7"]},"par":3,"maxMoves":8,"hints":[{"en":"Each pawn sits exactly one L from the last.","fr":"Chaque pion est à exactement un L du précédent.","ar":"كل بيدق على بعد L واحدة من سابقه."},{"en":"Start at the bottom: f3.","fr":"Commencez en bas : f3.","ar":"ابدأ من الأسفل: f3."},{"en":"Play xxf3, xxe5, xxd7.","fr":"Jouez xxf3, xxe5, xxd7.","ar":"العب xxf3 ثم xxe5 ثم xxd7."}],"explain":{"en":"Captures chain when each victim aims the next L.","fr":"Les captures s'enchaînent quand chaque victime vise le L suivant.","ar":"تتسلسل الالتقاطات عندما توجّه كل ضحية L التالية."},"success":{"en":"Ladder climbed, three pawns eaten!","fr":"Échelle grimpée, trois pions mangés !","ar":"صعدت السلم وأكلت ثلاثة بيادق!"},"failHint":{"en":"Up the ladder: f3, e5, d7.","fr":"Montez l'échelle : f3, e5, d7.","ar":"اصعد السلم: f3 ثم e5 ثم d7."},"xp":15,"set":"s1-knight","difficulty":2},{"id":"s1n-5","stage":1,"group":"knight","themes":["knight","obstacles"],"mode":"free-move","type":"free-move","title":{"en":"Knight: the obvious square burns","fr":"Cavalier : la case évidente brûle","ar":"الحصان: المربع الواضح يحرق"},"goalText":{"en":"f3 looks tempting but it's lava. Collect all 3 stars the long way.","fr":"f3 semble tentante mais c'est de la lave. Ramassez les étoiles par le long chemin.","ar":"f3 يبدو مغريًا لكنه حمم. اجمع النجوم الثلاث بالطريق الطويل."},"fen":"4k3/8/8/8/8/8/8/4K1N1 w - - 0 1","movePieces":["n"],"goal":{"collect":["e2","g3","h5"]},"obstacles":["f3"],"par":3,"maxMoves":8,"hints":[{"en":"f3 burns — take the quiet e2 road instead.","fr":"f3 brûle — prenez plutôt la route tranquille e2.","ar":"f3 تحرق — اسلك طريق e2 الهادئ بدلًا منها."},{"en":"e2, g3, h5 link tip-to-tail.","fr":"e2, g3, h5 s'enchaînent.","ar":"e2 وg3 وh5 تتسلسل."},{"en":"Play e2, g3, h5.","fr":"Jouez e2, g3, h5.","ar":"العب e2 ثم g3 ثم h5."}],"explain":{"en":"The flashiest square is often bait — the quiet road collects more.","fr":"La case la plus voyante est souvent un appât — la route discrète rapporte plus.","ar":"المربع الأبرز غالبًا طُعم — الطريق الهادئ يجمع أكثر."},"success":{"en":"Bait ignored — patient knight wins!","fr":"Appât ignoré — le cavalier patient gagne !","ar":"تجاهلت الطعم — الحصان الصبور يفوز!"},"failHint":{"en":"Around the lava: e2, g3, h5.","fr":"Autour de la lave : e2, g3, h5.","ar":"حول الحمم: e2 ثم g3 ثم h5."},"xp":15,"set":"s1-knight","difficulty":2},{"id":"s1n-6","stage":1,"group":"knight","themes":["knight","route"],"mode":"free-move","type":"free-move","title":{"en":"Knight: the five-jump tour","fr":"Cavalier : le tour en cinq sauts","ar":"الحصان: جولة القفزات الخمس"},"goalText":{"en":"Collect all 5 stars. Every jump must land a star — plan it!","fr":"Ramassez les 5 étoiles. Chaque saut doit rapporter — planifiez !","ar":"اجمع النجوم الخمس. كل قفزة يجب أن تجمع — خطط!"},"fen":"4k3/8/8/8/8/8/8/4K1N1 w - - 0 1","movePieces":["n"],"goal":{"collect":["f3","h4","f5","e3","d5"]},"par":5,"maxMoves":12,"hints":[{"en":"Five stars, five landings — zero transit allowed.","fr":"Cinq étoiles, cinq arrivées — aucun transit permis.","ar":"خمس نجوم وخمس وقفات — لا عبور مسموح."},{"en":"Start f3–h4 along the edge, then turn inward.","fr":"Commencez f3–h4 le long du bord, puis rentrez.","ar":"ابدأ f3–h4 على الحافة ثم ادخل."},{"en":"One tour: f3, h4, f5, e3, d5.","fr":"Un parcours : f3, h4, f5, e3, d5.","ar":"جولة واحدة: f3 ثم h4 ثم f5 ثم e3 ثم d5."}],"explain":{"en":"Perfect tours never land empty: each arrival aims the next.","fr":"Les parcours parfaits n'arrivent jamais à vide : chaque arrivée vise la suivante.","ar":"الجولات المثالية لا تقف فارغة أبدًا: كل وصول يوجّه التالي."},"success":{"en":"Five jumps, five stars — knight grandmaster!","fr":"Cinq sauts, cinq étoiles — grand maître cavalier !","ar":"خمس قفزات وخمس نجوم — أستاذ حصان كبير!"},"failHint":{"en":"f3–h4–f5–e3–d5: every landing counts.","fr":"f3–h4–f5–e3–d5 : chaque arrivée compte.","ar":"f3–h4–f5–e3–d5: كل وقفة محسوبة."},"xp":20,"set":"s1-knight","difficulty":3},{"id":"s1p-1","stage":1,"group":"pawn","themes":["pawn","movement"],"mode":"free-move","type":"free-move","title":{"en":"Pawn: march ahead","fr":"Pion : en avant","ar":"البيدق: إلى الأمام"},"intro":{"en":"Pawns march straight ahead, never back. Collect the stairs — steady pawns win points!","fr":"Les pions avancent tout droit, jamais en arrière. Ramassez l'escalier — les pions réguliers gagnent !","ar":"تتقدم البيادق للأمام فقط ولا تعود أبدًا. اجمع الدرج — البيادق الثابتة تكسب!"},"goalText":{"en":"March up and collect both stars.","fr":"Avancez et ramassez les deux étoiles.","ar":"تقدّم واجمع النجمتين."},"fen":"4k3/8/8/8/8/8/4P3/4K3 w - - 0 1","movePieces":["p"],"goal":{"collect":["e3","e4"]},"par":2,"maxMoves":8,"hints":[{"en":"Pawns step one square straight ahead.","fr":"Les pions avancent d'une case tout droit.","ar":"يتقدم البيدق مربعًا واحدًا للأمام."},{"en":"Don't double-jump: you'd skip e3 forever.","fr":"Pas de double saut : vous rateriez e3 pour toujours.","ar":"لا تقفز قفزة مزدوجة: ستفوت e3 للأبد."},{"en":"Play e3, then e4.","fr":"Jouez e3, puis e4.","ar":"العب e3 ثم e4."}],"explain":{"en":"Pawns never move backward — skipped stars stay skipped.","fr":"Les pions ne reculent jamais — les étoiles ratées restent ratées.","ar":"البيادق لا تتراجع أبدًا — النجوم الفائتة تبقى فائتة."},"success":{"en":"Steady march — no star left behind!","fr":"Marche régulière — aucune étoile oubliée !","ar":"مسيرة ثابتة — لا نجمة تُركت!"},"failHint":{"en":"One step at a time: e3, then e4.","fr":"Un pas à la fois : e3, puis e4.","ar":"خطوة كل مرة: e3 ثم e4."},"xp":10,"set":"s1-pawn","difficulty":2},{"id":"s1p-2","stage":1,"group":"pawn","themes":["pawn","capture"],"mode":"free-move","type":"free-move","title":{"en":"Pawn: take diagonally","fr":"Pion : prendre en diagonale","ar":"البيدق: الالتقاط قطريًا"},"goalText":{"en":"Capture the pawn, then collect the star.","fr":"Capturez le pion, puis ramassez l'étoile.","ar":"التقط البيدق ثم اجمع النجمة."},"fen":"4k3/8/8/8/8/3p4/4P3/4K3 w - - 0 1","movePieces":["p"],"goal":{"capture":["d3"],"collect":["d4"]},"par":2,"maxMoves":8,"hints":[{"en":"Pawns walk straight but capture one square diagonally.","fr":"Les pions marchent droit mais capturent d'une case en diagonale.","ar":"تمشي البيادق مستقيمة لكنها تلتقط قطريًا بمربع واحد."},{"en":"The d3 pawn stands on your diagonal.","fr":"Le pion d3 est sur votre diagonale.","ar":"بيدق d3 على قطرك."},{"en":"Play exd3, then d4.","fr":"Jouez exd3, puis d4.","ar":"العب exd3 ثم d4."}],"explain":{"en":"Straight to walk, diagonal to eat — the pawn's two rules.","fr":"Droit pour marcher, diagonale pour manger — les deux règles du pion.","ar":"مستقيم للمشي وقطري للأكل — قاعدتا البيدق."},"success":{"en":"Take and march — pawn essentials!","fr":"Prendre et marcher — l'essentiel du pion !","ar":"التقط وتقدّم — أساسيات البيدق!"},"failHint":{"en":"Eat first (exd3), then march (d4).","fr":"Mangez d'abord (exd3), puis marchez (d4).","ar":"كُل أولًا (exd3) ثم تقدّم (d4)."},"xp":10,"set":"s1-pawn","difficulty":2},{"id":"s1p-3","stage":1,"group":"pawn","themes":["pawn","blocked-path"],"mode":"free-move","type":"free-move","title":{"en":"Pawn: blocked road","fr":"Pion : route bloquée","ar":"البيدق: طريق مسدود"},"goalText":{"en":"An enemy pawn blocks your file. Go around it and collect both stars.","fr":"Un pion ennemi bloque votre colonne. Contournez-le et ramassez les étoiles.","ar":"بيدق عدو يسد عمودك. التفّ حوله واجمع النجمتين."},"fen":"4k3/8/8/8/8/3pp3/4P3/4K3 w - - 0 1","movePieces":["p"],"goal":{"collect":["d4","d5"]},"par":3,"maxMoves":8,"hints":[{"en":"e3 blocks every straight push.","fr":"e3 bloque toute poussée droite.","ar":"e3 يسد كل دفعة مستقيمة."},{"en":"But d3 is capturable — take it and switch files.","fr":"Mais d3 est prenable — prenez-le et changez de colonne.","ar":"لكن d3 قابل للالتقاط — خذه وغيّر العمود."},{"en":"Play exd3, d4, d5.","fr":"Jouez exd3, d4, d5.","ar":"العب exd3 ثم d4 ثم d5."}],"explain":{"en":"A capture can change files — the pawn's only way around a wall.","fr":"Une capture peut changer de colonne — le seul contournement du pion.","ar":"الالتقاط قد يغيّر العمود — المخرج الوحيد للبيدق حول الجدار."},"success":{"en":"Wall outflanked by capture!","fr":"Mur contourné par capture !","ar":"التففت على الجدار بالالتقاط!"},"failHint":{"en":"Straight is dead — capture to d3, then climb.","fr":"Tout droit est mort — capturez en d3, puis montez.","ar":"المستقيم ميت — التقط إلى d3 ثم اصعد."},"xp":15,"set":"s1-pawn","difficulty":2},{"id":"s1p-4","stage":1,"group":"pawn","themes":["pawn","capture"],"mode":"free-move","type":"free-move","title":{"en":"Pawn: the capture trail","fr":"Pion : la piste des captures","ar":"البيدق: درب الالتقاط"},"goalText":{"en":"Capture both black pawns.","fr":"Capturez les deux pions noirs.","ar":"التقط البيدقين الأسودين."},"fen":"4k3/8/8/1p6/8/2p5/3P4/4K3 w - - 0 1","movePieces":["p"],"goal":{"capture":["c3","b5"]},"par":3,"maxMoves":8,"hints":[{"en":"Captures zigzag the pawn across files.","fr":"Les captures font zigzaguer le pion entre les colonnes.","ar":"الالتقاطات تجعل البيدق يتعرج بين الأعمدة."},{"en":"d2 takes c3 first.","fr":"d2 prend c3 d'abord.","ar":"d2 يأخذ c3 أولًا."},{"en":"Play dxc3, c4, cxb5.","fr":"Jouez dxc3, c4, cxb5.","ar":"العب dxc3 ثم c4 ثم cxb5."}],"explain":{"en":"Two captures, one transit: zigzag costs a middle step.","fr":"Deux captures, un transit : le zigzag coûte un pas intermédiaire.","ar":"التقاطان وعبور واحد: التعرج يكلّف خطوة وسطى."},"success":{"en":"Trail of captures complete!","fr":"Piste des captures terminée !","ar":"اكتمل درب الالتقاط!"},"failHint":{"en":"c3, step, b5: dxc3, c4, cxb5.","fr":"c3, pas, b5 : dxc3, c4, cxb5.","ar":"c3 ثم خطوة ثم b5: dxc3 ثم c4 ثم cxb5."},"xp":15,"set":"s1-pawn","difficulty":2},{"id":"s1p-5","stage":1,"group":"pawn","themes":["pawn","capture"],"mode":"free-move","type":"free-move","title":{"en":"Pawn: capture and promote-march","fr":"Pion : capturer puis monter","ar":"البيدق: التقط ثم اصعد"},"goalText":{"en":"Capture twice, then march the star home.","fr":"Capturez deux fois, puis ramenez l'étoile.","ar":"التقط مرتين ثم اصعد بالنجمة."},"fen":"4k3/8/8/1p6/8/2p5/3P4/4K3 w - - 0 1","movePieces":["p"],"goal":{"capture":["c3","b5"],"collect":["b7"]},"par":5,"maxMoves":12,"hints":[{"en":"Same trail as before — then keep marching.","fr":"Même piste qu'avant — puis continuez à monter.","ar":"نفس الدرب السابق — ثم واصل الصعود."},{"en":"After b5, single steps only: moved pawns lose the double push.","fr":"Après b5, que des petits pas : un pion déplacé perd la double poussée.","ar":"بعد b5 خطوات مفردة فقط: البيدق المتحرك يفقد الدفعة المزدوجة."},{"en":"Play dxc3, c4, cxb5, b6, b7.","fr":"Jouez dxc3, c4, cxb5, b6, b7.","ar":"العب dxc3 ثم c4 ثم cxb5 ثم b6 ثم b7."}],"explain":{"en":"The double push is one-time-only: plan around single steps after.","fr":"La double poussée est unique : prévoyez des petits pas ensuite.","ar":"الدفعة المزدوجة لمرة واحدة: خطط لخطوات مفردة بعدها."},"success":{"en":"Five-move masterpiece march!","fr":"Marche chef-d'œuvre en cinq coups !","ar":"مسيرة رائعة في خمس نقلات!"},"failHint":{"en":"dxc3, c4, cxb5, b6, b7.","fr":"dxc3, c4, cxb5, b6, b7.","ar":"dxc3 ثم c4 ثم cxb5 ثم b6 ثم b7."},"xp":15,"set":"s1-pawn","difficulty":3},{"id":"s1p-6","stage":1,"group":"pawn","themes":["pawn","promotion"],"mode":"free-move","type":"free-move","title":{"en":"Pawn: promote and conquer","fr":"Pion : promouvoir et conquérir","ar":"البيدق: رقِّ واسُد"},"goalText":{"en":"Push to the last rank, promote, then rule h8.","fr":"Poussez jusqu'au bout, promovez, puis régnez sur h8.","ar":"ادفع حتى الصف الأخير ورقِّ ثم احكم h8."},"fen":"8/4k3/P7/8/8/8/8/4K3 w - - 0 1","movePieces":["p","q","r","b","n"],"goal":{"reach":{"square":"h8"}},"par":3,"maxMoves":8,"hints":[{"en":"A pawn on its 7th rank is one step from glory.","fr":"Un pion au 7e rang est à un pas de la gloire.","ar":"البيدق في الصف السابع على بعد خطوة من المجد."},{"en":"Promote first — almost always to queen.","fr":"Promovez d'abord — presque toujours en dame.","ar":"رقِّ أولًا — غالبًا إلى ملكة."},{"en":"Play a7, a8=Q, Qh8.","fr":"Jouez a7, a8=D, Dh8.","ar":"العب a7 ثم a8=Q ثم Qh8."}],"explain":{"en":"Promotion turns your weakest piece into your strongest — then it rules.","fr":"La promotion change votre pièce la plus faible en plus forte — puis elle règne.","ar":"الترقية تحوّل أضعف قطعك إلى أقواها — ثم تحكم."},"success":{"en":"Crowned! From pawn to ruler of h8!","fr":"Couronné ! De pion à maître de h8 !","ar":"تُوّجت! من بيدق إلى حاكم h8!"},"failHint":{"en":"Climb, crown, conquer: a7, a8, h8.","fr":"Montez, couronnez, conquérez : a7, a8, h8.","ar":"اصعد وتوَّج واسُد: a7 ثم a8 ثم h8."},"xp":20,"set":"s1-pawn","difficulty":2},{"id":"s2-castle-1","stage":2,"set":"s2-castle","group":"Castling","themes":["castling","king-safety"],"mode":"free-move","type":"free-move","title":{"en":"Castle kingside"},"intro":{"en":"Castling tucks the king away and brings a rook to the center. One move does both!"},"goalText":{"en":"Castle kingside — land the king on g1."},"fen":"r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1","movePieces":["k"],"goal":{"reach":{"square":"g1","piece":"k"}},"par":1,"maxMoves":6,"hints":[{"en":"The king can jump two squares toward the rook to castle."},{"en":"Slide the king from e1 to g1 — the rook hops over automatically."},{"en":"Play Ke1-g1 (written O-O)."}],"explain":{"en":"Castling moves the king two squares toward a rook, and the rook hops to the square the king crossed. It is the only move where two pieces move at once."},"success":{"en":"Castled! The king is safe on the wing."},"failHint":{"en":"Drag the king from e1 to g1 — not a normal one-square step."},"xp":20,"difficulty":1},{"id":"s2-castle-2","stage":2,"set":"s2-castle","group":"Castling","themes":["castling","king-safety"],"mode":"free-move","type":"free-move","title":{"en":"Castle queenside"},"intro":{"en":"Queenside castling sends the king to c1. Same idea, other direction."},"goalText":{"en":"Castle queenside — land the king on c1."},"fen":"r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1","movePieces":["k"],"goal":{"reach":{"square":"c1","piece":"k"}},"par":1,"maxMoves":6,"hints":[{"en":"The king moves toward the a-file rook this time."},{"en":"Drag the king from e1 to c1."},{"en":"Play Ke1-c1 (written O-O-O)."}],"explain":{"en":"Queenside castling moves the king to c1 and the a-file rook to d1. It covers three squares the king crosses, so it needs a clear path just like kingside."},"success":{"en":"Queenside! The rook lands on d1 ready for action."},"failHint":{"en":"Drag the king from e1 toward the queenside rook (c1)."},"xp":20,"difficulty":1},{"id":"s2-castle-3","stage":2,"set":"s2-castle","group":"Castling","themes":["castling","king-safety","check"],"mode":"free-move","type":"free-move","title":{"en":"No castling through check"},"intro":{"en":"You cannot castle through, out of, or into check. The rook eyes g1 — go the other way."},"goalText":{"en":"The rook guards g1 — castle queenside to c1 instead."},"fen":"6r1/8/8/8/8/8/8/R3K2R w KQ - 0 1","movePieces":["k"],"goal":{"reach":{"square":"c1","piece":"k"}},"par":1,"maxMoves":6,"hints":[{"en":"Kingside castling would cross f1 and land on g1 — both attacked by the rook."},{"en":"Only the queenside path is safe."},{"en":"Play Ke1-c1 (O-O-O)."}],"explain":{"en":"A king may not castle if it would pass through or land on an attacked square. With a rook firing down the g-file, kingside castling is illegal — queenside is the safe choice."},"success":{"en":"Good read — you castled away from the fire."},"failHint":{"en":"Kingside is illegal here (through check). Try c1."},"xp":25,"difficulty":1},{"id":"s2-ep-1","stage":2,"set":"s2-ep","group":"En passant","themes":["en-passant","pawns"],"mode":"free-move","type":"free-move","title":{"en":"Capture en passant"},"intro":{"en":"A pawn that just advanced two squares can be captured as if it moved one. Grab it!"},"goalText":{"en":"Capture the black pawn on d5 en passant."},"fen":"4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1","movePieces":["p"],"goal":{"capture":["d5"]},"par":1,"maxMoves":4,"hints":[{"en":"En passant target squares show up right after a two-square pawn push."},{"en":"Your e5 pawn captures onto d6 — the square behind the d5 pawn."},{"en":"Play e5-d6 (exd6 e.p.)."}],"explain":{"en":"When a pawn advances two squares past an enemy pawn, that enemy pawn may capture it on the bypassed square — en passant (\"in passing\"). The capture lands on the square the pawn skipped."},"success":{"en":"En passant! The sneaky pawn capture."},"failHint":{"en":"Capture diagonally onto d6, not onto d5 directly."},"xp":25,"difficulty":1},{"id":"s2-promo-1","stage":2,"set":"s2-promo","group":"Promotion","themes":["promotion","pawns"],"mode":"free-move","type":"free-move","title":{"en":"Promote to a queen"},"intro":{"en":"A pawn reaching the last rank becomes any piece. A queen is usually best!"},"goalText":{"en":"Push the pawn to e8 and promote to a queen."},"fen":"7k/4P3/8/8/8/8/8/4K3 w - - 0 1","movePieces":["p"],"goal":{"reach":{"square":"e8","piece":"p"}},"par":1,"maxMoves":4,"hints":[{"en":"Pawns promote on the 8th rank (for White)."},{"en":"Advance the e7 pawn to e8."},{"en":"Play e7-e8 and pick the queen."}],"explain":{"en":"When a pawn reaches the far rank it MUST promote — to a queen, rook, bishop, or knight. The queen, combining rook and bishop power, is the usual choice."},"success":{"en":"A new queen! Biggest upgrade on the board."},"failHint":{"en":"Move the e7 pawn to e8, then choose the queen."},"xp":20,"difficulty":1},{"id":"s2-promo-2","stage":2,"set":"s2-promo","group":"Promotion","themes":["promotion","mate","back-rank"],"mode":"free-move","type":"free-move","title":{"en":"Promote with mate"},"intro":{"en":"Sometimes promoting ends the game at once. Find the mating promotion."},"goalText":{"en":"Promote on e8 — the new queen (or rook) delivers checkmate."},"fen":"6k1/4P1pp/8/8/8/8/8/4K3 w - - 0 1","movePieces":["p"],"goal":{"mate":true},"par":1,"maxMoves":4,"hints":[{"en":"The black king is boxed in by its own pawns on f7, g7, h7."},{"en":"A queen or rook on e8 would check along the open 8th rank."},{"en":"Play e7-e8 and promote to queen (or rook)."}],"explain":{"en":"Promotion is not just about material — a promoting pawn can deliver the final blow. Here the back rank is weak: a queen (or rook) on e8 checks the trapped king with no escape."},"success":{"en":"Promotion mate! A textbook finish."},"failHint":{"en":"Promote on e8 — a queen or rook both mate here."},"xp":30,"difficulty":1},{"id":"s2-promo-3","stage":2,"set":"s2-promo","group":"Promotion","themes":["promotion","underpromotion"],"mode":"free-move","type":"free-move","title":{"en":"Sometimes promote to a knight"},"intro":{"en":"Most promotions are queens — but not every promotion should be. Here only a knight works."},"goalText":{"en":"Promote on e8 — but only a knight completes the goal."},"fen":"7k/4P3/8/8/8/8/8/4K3 w - - 0 1","movePieces":["p"],"goal":{"reach":{"square":"e8","piece":"n"}},"par":1,"maxMoves":4,"hints":[{"en":"The goal demands a knight specifically — the piece type matters."},{"en":"Advance e7-e8, then pick the knight from the menu."},{"en":"Play e7-e8 and choose N (underpromotion)."}],"explain":{"en":"Underpromotion means choosing a piece other than a queen. It is rare, but sometimes a knight (the only piece that can fork from a new square) or a rook (avoiding stalemate) is exactly right."},"success":{"en":"Underpromotion! Right tool for the job."},"failHint":{"en":"Promote to a knight, not a queen."},"xp":30,"difficulty":1},{"id":"s3-check-1","stage":3,"set":"s3-check","group":"Check","themes":["check","rook"],"mode":"free-move","type":"free-move","title":{"en":"Give check with the rook"},"intro":{"en":"Check attacks the king — it must move (or block/capture). Find any rook check."},"goalText":{"en":"Move the rook to give check to the black king."},"fen":"4k3/8/8/8/8/8/8/R3K3 w - - 0 1","movePieces":["r"],"goal":{"check":true},"par":1,"maxMoves":6,"hints":[{"en":"A rook checks by attacking the king along a rank or file."},{"en":"The e-file leads straight to the black king on e8."},{"en":"Play Ra1-e1 (or any square on the e-file or 8th rank)."}],"explain":{"en":"Check is an attack on the king. The opponent cannot ignore it — they must capture the attacker, block the line, or move the king. Rooks are natural checkers with their long straight lines."},"success":{"en":"Check! The king must respond."},"failHint":{"en":"Land the rook on the e-file or 8th rank to attack the king."},"xp":15,"difficulty":1},{"id":"s3-check-2","stage":3,"set":"s3-check","group":"Check","themes":["check","knight"],"mode":"free-move","type":"free-move","title":{"en":"Give check with the knight"},"intro":{"en":"Knights give brutal checks — they jump over everything and cannot be blocked."},"goalText":{"en":"Jump the knight to give check to the black king."},"fen":"4k3/8/8/1N6/8/8/8/4K3 w - - 0 1","movePieces":["n"],"goal":{"check":true},"par":1,"maxMoves":6,"hints":[{"en":"A knight on c7 or d6 would attack the king on e8."},{"en":"Knights move in an L and cannot be blocked."},{"en":"Play Nb5-c7 or Nb5-d6."}],"explain":{"en":"Knight checks are extra dangerous because no piece can block a knight — the king itself must move (or capture). Squares like c7 and d6 are classic knight-check outposts."},"success":{"en":"Knight check! Unstoppable by blocking."},"failHint":{"en":"Move the knight so it attacks e8 (try c7 or d6)."},"xp":15,"difficulty":1},{"id":"s3-check-3","stage":3,"set":"s3-check","group":"Check","themes":["check","discovered"],"mode":"free-move","type":"free-move","title":{"en":"Discovered check"},"intro":{"en":"Slide a piece away to uncover a hidden check behind it. Devastating!"},"goalText":{"en":"Move the knight away to reveal the rook’s check on the king."},"fen":"8/4k3/8/8/4N3/8/2K5/4R3 w - - 0 1","movePieces":["n"],"goal":{"check":true},"par":1,"maxMoves":6,"hints":[{"en":"The rook on e1 already stares at the king — only the knight blocks it."},{"en":"Any knight move off the e-file unleashes the rook."},{"en":"Play the e4 knight anywhere (e.g. Ne4-d2)."}],"explain":{"en":"A discovered check happens when one piece moves away and uncovers an attack from a piece behind it. The moving piece is also free to go anywhere — often giving a double threat."},"success":{"en":"Discovered check! The hidden rook fires."},"failHint":{"en":"Move the knight off the e-file to uncover the rook."},"xp":25,"difficulty":1},{"id":"s3-mate-1","stage":3,"set":"s3-mate","group":"Checkmate","themes":["mate","back-rank"],"mode":"free-move","type":"free-move","title":{"en":"Back-rank mate"},"intro":{"en":"The king is trapped behind its own pawns. One rook on the back rank ends it."},"goalText":{"en":"Deliver checkmate on the back rank."},"fen":"6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1","movePieces":["r"],"goal":{"mate":true},"par":1,"maxMoves":4,"hints":[{"en":"The black king on g8 is blocked by its own f7, g7, h7 pawns."},{"en":"A rook on the 8th rank checks with no escape."},{"en":"Play Re1-e8 (Re8#)."}],"explain":{"en":"The back-rank mate exploits pawns that never advanced, sealing the king’s escape squares. A single rook on the back rank delivers mate. Always be alert for this pattern — for both sides!"},"success":{"en":"Back-rank mate! Textbook finish."},"failHint":{"en":"Slide the rook to the 8th rank (e8)."},"xp":25,"difficulty":1},{"id":"s3-mate-2","stage":3,"set":"s3-mate","group":"Checkmate","themes":["mate","queen","king"],"mode":"free-move","type":"free-move","title":{"en":"Queen + king mate"},"intro":{"en":"With a queen and king, herd the lone king to the edge and close the net."},"goalText":{"en":"Checkmate the black king with your queen."},"fen":"7k/8/5K2/8/8/8/8/6Q1 w - - 0 1","movePieces":["q"],"goal":{"mate":true},"par":1,"maxMoves":5,"hints":[{"en":"The queen needs the king’s support to deliver mate safely."},{"en":"Place the queen on g7 — right next to the king, defended by your king."},{"en":"Play Qg1-g7 (Qg7#)."}],"explain":{"en":"Queen-and-king mate works by shrinking the enemy king’s space to the edge, then placing the queen adjacent (supported by the king) so it checks with no capture or flight. The queen alone cannot mate — the king must help."},"success":{"en":"Queen mate! The net is closed."},"failHint":{"en":"Put the queen on g7, defended by your king on g6."},"xp":25,"difficulty":1},{"id":"s3-mate-3","stage":3,"set":"s3-mate","group":"Checkmate","themes":["mate","rook","king"],"mode":"free-move","type":"free-move","title":{"en":"Rook + king mate"},"intro":{"en":"The rook mates on the edge while the king takes away the escape squares."},"goalText":{"en":"Checkmate the black king with your rook."},"fen":"k7/8/1K6/8/8/8/8/7R w - - 0 1","movePieces":["r"],"goal":{"mate":true},"par":1,"maxMoves":5,"hints":[{"en":"The king on b6 already covers a7, b7, c7."},{"en":"A rook on the 8th rank checks the cornered king."},{"en":"Play Rh1-h8 (Rh8#)."}],"explain":{"en":"Rook-and-king mate forces the enemy king to the edge using the friendly king as a wall, then the rook delivers a distant check along the edge rank or file."},"success":{"en":"Rook mate! King and rook teamwork."},"failHint":{"en":"Check along the 8th rank with Rh8."},"xp":25,"difficulty":1},{"id":"s3-mate-4","stage":3,"set":"s3-mate","group":"Checkmate","themes":["mate","queen","pawn"],"mode":"free-move","type":"free-move","title":{"en":"Queen mate with pawn cover"},"intro":{"en":"A pawn can take away the key escape square. Combine it with the queen."},"goalText":{"en":"Checkmate the black king — your pawn covers the flight square."},"fen":"7k/8/5KP1/8/8/8/8/3Q4 w - - 0 1","movePieces":["q"],"goal":{"mate":true},"par":1,"maxMoves":5,"hints":[{"en":"The pawn on g6 covers h7 — the king’s only flight square."},{"en":"A queen on the 8th rank checks; h7 is taken by the pawn."},{"en":"Play Qd1-d8 (Qd8#)."}],"explain":{"en":"Mates often need a helper. Here the g6 pawn covers h7, so a queen on d8 checks along the rank with the king boxed between the queen and its own edge — no escape remains."},"success":{"en":"Mate with a little pawn help!"},"failHint":{"en":"Check on the 8th rank (Qd8) — the pawn guards h7."},"xp":30,"difficulty":1},{"id":"s3-draw-1","stage":3,"set":"s3-draw","group":"Stalemate","themes":["stalemate","draw"],"mode":"free-move","type":"free-move","title":{"en":"Stalemate is a draw"},"intro":{"en":"If the opponent has no legal move and is NOT in check, the game is drawn. Sometimes that saves you!"},"goalText":{"en":"Stalemate the black king (no moves, not in check)."},"fen":"k7/8/1K6/8/8/8/2Q5/8 w - - 0 1","movePieces":["q"],"goal":{"stalemate":true},"par":1,"maxMoves":5,"hints":[{"en":"Stalemate is NOT check — the queen must cover every flight square without attacking the king."},{"en":"The king on a8 has squares a7, b7, b8 — cover all three without checking."},{"en":"Play Qc2-c7 (Qc7 — stalemate)."}],"explain":{"en":"Stalemate: the side to move has no legal move and their king is not in check → draw. A player losing badly can sometimes force stalemate to save half a point. The queen on c7 covers a7, b7, and b8 while leaving the king unstopped but uncheckmated."},"success":{"en":"Stalemate — a brilliant save!"},"failHint":{"en":"Cover a7, b7, b8 with the queen — but do NOT check the king."},"xp":30,"difficulty":1},{"id":"s4-hang-1","stage":4,"set":"s4-hang","group":"Hanging pieces","themes":["hanging","capture"],"mode":"free-move","type":"free-move","title":{"en":"Take the hanging piece"},"intro":{"en":"A hanging piece is undefended. Free material — just grab it."},"goalText":{"en":"Capture the undefended black knight on d5."},"fen":"4k3/8/8/3n4/2B5/8/8/4K3 w - - 0 1","movePieces":["b"],"goal":{"capture":["d5"]},"par":1,"maxMoves":4,"hints":[{"en":"Look for enemy pieces with no defender nearby."},{"en":"The knight on d5 is guarded by nothing."},{"en":"Play Bc4xd5."}],"explain":{"en":"A hanging (undefended) piece can be captured for free. Before every move, scan: can I take something the opponent cannot recapture? Here the knight on d5 sits alone."},"success":{"en":"Clean capture — free knight!"},"failHint":{"en":"Take the knight on d5 with the bishop."},"xp":15,"difficulty":1,"opponent":true},{"id":"s4-hang-2","stage":4,"set":"s4-hang","group":"Hanging pieces","themes":["hanging","capture"],"mode":"free-move","type":"free-move","title":{"en":"Win both hanging pieces"},"intro":{"en":"Two undefended pieces line up. Take them both."},"goalText":{"en":"Capture both hanging black pieces (bishop on d4, knight on d5)."},"fen":"4k3/8/8/3n4/3b4/8/8/3QK3 w - - 0 1","movePieces":["q"],"goal":{"capture":["d4","d5"]},"par":2,"maxMoves":5,"hints":[{"en":"Both black pieces sit on the d-file, stacked."},{"en":"The queen can take them one after the other."},{"en":"Play Qd1xd4, then Qd4xd5."}],"explain":{"en":"When several pieces hang, take them in the order that keeps your attacks flowing. Here the queen sweeps the d-file, gobbling the bishop then the knight."},"success":{"en":"Double harvest! Two free pieces."},"failHint":{"en":"Take the bishop on d4 first, then the knight on d5."},"xp":20,"difficulty":2,"opponent":true},{"id":"s4-pin-1","stage":4,"set":"s4-pin","group":"Pins","themes":["pin","capture"],"mode":"free-move","type":"free-move","title":{"en":"Capture the pinned piece"},"intro":{"en":"A pinned piece cannot move away — it is stuck protecting what is behind it. Win it!"},"goalText":{"en":"The knight is pinned to the king — capture it."},"fen":"4k3/8/8/4n3/8/8/8/3KR3 w - - 0 1","movePieces":["r"],"goal":{"capture":["e5"]},"par":1,"maxMoves":4,"hints":[{"en":"The knight on e5 is pinned against the king on e8 by your rook."},{"en":"A pinned piece cannot legally move (it would expose its king)."},{"en":"Play Re1-e5 (Rxe5)."}],"explain":{"en":"An absolute pin traps a piece against the king — it has zero legal moves. You can simply win it, because it cannot flee. Here the rook pins the knight to the king along the e-file."},"success":{"en":"The pinned knight falls — free material."},"failHint":{"en":"The knight on e5 is pinned; take it with the rook."},"xp":20,"difficulty":1,"opponent":true},{"id":"s4-pin-2","stage":4,"set":"s4-pin","group":"Pins","themes":["pin","capture"],"mode":"free-move","type":"free-move","title":{"en":"Pin to the queen"},"intro":{"en":"Pins are not only against kings. A piece shielding a queen is also stuck — win it."},"goalText":{"en":"The knight is pinned to the queen — capture it."},"fen":"4q3/8/8/4n3/8/8/8/2K1R3 w - - 0 1","movePieces":["r"],"goal":{"capture":["e5"]},"par":1,"maxMoves":4,"hints":[{"en":"The knight on e5 blocks the rook’s attack on the queen behind it."},{"en":"Moving the knight would lose the queen — so it stays put."},{"en":"Capture the knight on e5 with the rook (Rxe5)."}],"explain":{"en":"A relative pin traps a piece against a valuable piece (not the king). The pinned piece can legally move, but doing so loses the piece behind it — effectively stuck. Here the knight guards the queen and pays the price."},"success":{"en":"Relative pin converted to material."},"failHint":{"en":"Take the pinned knight on e5."},"xp":25,"difficulty":1,"opponent":true},{"id":"s4-skewer","stage":4,"set":"s4-plan","group":"Planned","themes":["skewer"],"planned":true,"title":{"en":"Skewers"},"explain":{"en":"Attack two pieces in a line: the front one flees, the back one falls."},"difficulty":1},{"id":"s4-fork","stage":4,"set":"s4-plan","group":"Planned","themes":["fork"],"planned":true,"title":{"en":"Forks"},"explain":{"en":"One piece attacks two targets at once — the opponent cannot save both."},"difficulty":1},{"id":"s4-remove-defender","stage":4,"set":"s4-plan","group":"Planned","themes":["defender"],"planned":true,"title":{"en":"Remove the defender"},"explain":{"en":"Capture the piece that guards another, then take the now-defenseless prize."},"difficulty":1},{"id":"s4-deflection","stage":4,"set":"s4-plan","group":"Planned","themes":["deflection"],"planned":true,"title":{"en":"Deflection"},"explain":{"en":"Force a defender away from the square or piece it must protect."},"difficulty":1},{"id":"s4-decoy","stage":4,"set":"s4-plan","group":"Planned","themes":["decoy"],"planned":true,"title":{"en":"Decoys"},"explain":{"en":"Lure a piece to a square where it falls victim to a fork, pin, or mate."},"difficulty":1},{"id":"s4-zwischenzug","stage":4,"set":"s4-plan","group":"Planned","themes":["zwischenzug"],"planned":true,"title":{"en":"Zwischenzug"},"explain":{"en":"Insert an unexpected intermediate move (often a check) before the expected recapture."},"difficulty":1},{"id":"s5-dev-1","stage":5,"set":"s5-dev","group":"Development","themes":["development","knights"],"mode":"free-move","type":"free-move","title":{"en":"Develop both knights"},"intro":{"en":"Knights first! They are slow to the edges and quick to the center."},"goalText":{"en":"Develop both knights to c3 and f3."},"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","movePieces":["n"],"goal":{"collect":["c3","f3"]},"par":2,"maxMoves":8,"hints":[{"en":"The b1 and g knights aim for c3 and f3."},{"en":"Knights develop in one jump — no need to clear a path."},{"en":"Play Nb1-c3, then Ng1-f3."}],"explain":{"en":"Development means bringing pieces off the back rank into the game. Knights to c3/f3 (or c6/f6 for Black) control central squares and clear the way for castling."},"success":{"en":"Both knights developed — nice control of the center."},"failHint":{"en":"Land the knights on c3 and f3."},"xp":20,"difficulty":2,"opponent":true},{"id":"s5-dev-2","stage":5,"set":"s5-dev","group":"Development","themes":["development","bishops"],"mode":"free-move","type":"free-move","title":{"en":"Develop the bishops"},"intro":{"en":"Bishops love open diagonals. Point them at the enemy camp."},"goalText":{"en":"Develop both bishops to active squares (c4 and f4)."},"fen":"4k3/8/8/8/8/8/8/2B1KB2 w - - 0 1","movePieces":["b"],"goal":{"collect":["c4","f4"]},"par":2,"maxMoves":8,"hints":[{"en":"Bishops slide diagonally as far as the board allows."},{"en":"The c1 bishop reaches c4; the f1 bishop reaches f4."},{"en":"Play Bc1-c4, then Bf1-f4."}],"explain":{"en":"Developing bishops to active diagonals (often pointing at the opponent’s king) is a core opening goal. On their starting squares they are passive; one move makes them powerful."},"success":{"en":"Both bishops on active diagonals."},"failHint":{"en":"Move the bishops to c4 and f4."},"xp":20,"difficulty":2,"opponent":true},{"id":"s5-center-1","stage":5,"set":"s5-center","group":"Center","themes":["center","pawns"],"mode":"free-move","type":"free-move","title":{"en":"Occupy the center"},"intro":{"en":"Pawns in the center (d4/e4 for White) control key squares and free your pieces."},"goalText":{"en":"Push your center pawns to d4 and e4."},"fen":"4k3/8/8/8/8/8/3PPPPP/4K3 w - - 0 1","movePieces":["p"],"goal":{"collect":["d4","e4"]},"par":2,"maxMoves":6,"hints":[{"en":"Pawns advance one square (or two from their start)."},{"en":"The d2 and e2 pawns are your central duo."},{"en":"Play d2-d4 and e2-e4."}],"explain":{"en":"Central pawns on d4/e4 (or d5/e5) grab space, control key squares, and open diagonals for bishops. Classical openings fight for this center from move one."},"success":{"en":"Central pawns established — space and scope."},"failHint":{"en":"Advance the d and e pawns two squares each."},"xp":20,"difficulty":2,"opponent":true},{"id":"s5-rook-1","stage":5,"set":"s5-rook","group":"Rook play","themes":["rooks","open-files"],"mode":"free-move","type":"free-move","title":{"en":"Rooks on open files"},"intro":{"en":"Rooks belong on open files — lanes with no pawns — where they slice into enemy territory."},"goalText":{"en":"Move both rooks to the open d- and e-files."},"fen":"4k3/8/8/8/8/8/8/KR4R1 w - - 0 1","movePieces":["r"],"goal":{"collect":["d1","e1"]},"par":2,"maxMoves":6,"hints":[{"en":"The d- and e-files have no pawns — they are open."},{"en":"The b1 rook slides to d1; the g1 rook to e1."},{"en":"Play Rb1-d1 and Rg1-e1."}],"explain":{"en":"Rooks are strongest on open or half-open files, aiming at the enemy king and pawns. Central files (d, e) are the most prized in the opening and middlegame."},"success":{"en":"Both rooks on open files — real pressure."},"failHint":{"en":"Place the rooks on d1 and e1."},"xp":20,"difficulty":2,"opponent":true},{"id":"s5-rook-2","stage":5,"set":"s5-rook","group":"Rook play","themes":["rooks","seventh-rank"],"mode":"free-move","type":"free-move","title":{"en":"Rook on the 7th"},"intro":{"en":"A rook on the 7th rank attacks pawns from behind and cramps the enemy king."},"goalText":{"en":"Lift the rook to the 7th rank (a7)."},"fen":"4k3/8/8/8/8/8/1P6/R3K3 w - - 0 1","movePieces":["r"],"goal":{"reach":{"square":"a7","piece":"r"}},"par":1,"maxMoves":5,"hints":[{"en":"The 7th rank is the row just before the enemy’s home rank."},{"en":"The a-file is clear in front of the rook."},{"en":"Play Ra1-a7."}],"explain":{"en":"Rooks on the 7th (or 2nd for Black) are famously strong: they attack the enemy pawns from behind and restrict the king to the back rank. Many attacks are built on a “rook lift” to the 7th."},"success":{"en":"Rook established on the 7th — big pressure."},"failHint":{"en":"Slide the a1 rook up to a7."},"xp":20,"difficulty":1,"opponent":true},{"id":"s5-pawn-1","stage":5,"set":"s5-pawn","group":"Pawn play","themes":["passed-pawn","pawns"],"mode":"free-move","type":"free-move","title":{"en":"Push the passed pawn"},"intro":{"en":"A passed pawn has no enemy pawns blocking or guarding its path. Race it home!"},"goalText":{"en":"March the passed e-pawn up to e7."},"fen":"7k/8/8/8/8/8/4P3/4K3 w - - 0 1","movePieces":["p"],"goal":{"collect":["e7"]},"par":4,"maxMoves":8,"hints":[{"en":"No black pawn blocks or guards the e-file."},{"en":"Pawns advance toward the 8th rank — push it!"},{"en":"Play e2-e4, then e4-e5, e5-e6, e6-e7."}],"explain":{"en":"A passed pawn is a potential queen. In the endgame, pushing passed pawns — supported by the king — is often the whole strategy. Here the e-pawn walks free to the 7th."},"success":{"en":"The passed pawn is nearly a queen."},"failHint":{"en":"Keep pushing the e-pawn up the board."},"xp":25,"difficulty":3,"opponent":true},{"id":"s5-king-1","stage":5,"set":"s5-king","group":"King activity","themes":["king","endgame"],"mode":"free-move","type":"free-move","title":{"en":"Centralize the king"},"intro":{"en":"In the endgame the king becomes a fighter. Bring it to the center!"},"goalText":{"en":"March your king to the central square e4."},"fen":"8/8/8/8/8/8/8/K1k5 w - - 0 1","movePieces":["k"],"goal":{"collect":["e4"]},"par":6,"maxMoves":10,"hints":[{"en":"The king moves one square in any direction."},{"en":"Head diagonally toward the middle: b2, c3, d4, e4."},{"en":"Play Ka1-b2, Kb2-c3, Kc3-d4, Kd4-e4."}],"explain":{"en":"Early game: hide the king. Endgame: activate it! A centralized king controls squares, supports pawns, and harasses enemy pieces. Walking it to e4 is a model journey."},"success":{"en":"King centralized — a real endgame asset."},"failHint":{"en":"Walk the king toward the center square e4."},"xp":25,"difficulty":3,"opponent":true},{"id":"s6-kp-1","stage":6,"set":"s6-kp","group":"King + pawn","themes":["endgame","promotion","pawn"],"mode":"free-move","type":"free-move","title":{"en":"Escort the pawn home"},"intro":{"en":"With no enemy pieces, just push the pawn to promotion. The king can help if needed."},"goalText":{"en":"Push the e-pawn all the way to e8 and promote."},"fen":"7k/8/8/8/8/5K2/4P3/8 w - - 0 1","movePieces":["p"],"goal":{"reach":{"square":"e8","piece":"p"}},"par":5,"maxMoves":10,"hints":[{"en":"The path is clear — no black pieces in the way."},{"en":"Advance the pawn down the e-file, square by square."},{"en":"Play e2-e4, e4-e5, e5-e6, e6-e7, e7-e8=Q."}],"explain":{"en":"In a pure pawn endgame, a passed pawn promotes with no opposition. Push it steadily — every step brings a new queen closer. This is the simplest winning endgame."},"success":{"en":"The pawn promotes — game over."},"failHint":{"en":"Keep pushing the e-pawn toward the 8th rank."},"xp":25,"difficulty":3,"opponent":true},{"id":"s6-rook-1","stage":6,"set":"s6-rook","group":"Rook endings","themes":["endgame","rook","capture"],"mode":"free-move","type":"free-move","title":{"en":"Rooks eat pawns"},"intro":{"en":"Active rooks in the endgame harvest weak pawns. Grab the black pawn."},"goalText":{"en":"Use the rook to capture the black pawn on g2."},"fen":"7k/8/8/8/8/8/6p1/R5K1 w - - 0 1","movePieces":["r"],"goal":{"capture":["g2"]},"par":2,"maxMoves":6,"hints":[{"en":"The g-file and 2nd rank both lead to the pawn."},{"en":"Bring the rook to the 2nd rank first, then take."},{"en":"Play Ra1-a2, then Ra2-g2."}],"explain":{"en":"Rook endgames are drawn to activity: an active rook attacks enemy pawns from the side or behind. Here the rook swings to the 2nd rank and collects the loose pawn."},"success":{"en":"Pawn captured — activity pays off."},"failHint":{"en":"Route the rook to g2 and take the pawn."},"xp":20,"difficulty":2,"opponent":true},{"id":"s6-rook-2","stage":6,"set":"s6-rook","group":"Rook endings","themes":["endgame","mate","rook"],"mode":"free-move","type":"free-move","title":{"en":"Ladder mate with two rooks"},"intro":{"en":"Two rooks take turns checking along ranks, herding the king to the edge — the ladder."},"goalText":{"en":"Checkmate the lone king with two rooks (the ladder)."},"fen":"7k/8/8/8/8/8/8/RR6 w - - 0 1","movePieces":["r"],"goal":{"mate":true},"par":2,"maxMoves":6,"hints":[{"en":"One rook cuts off a rank; the other checks on the next."},{"en":"First take away the 7th rank, then check on the 8th."},{"en":"Play Rb1-b7 (cut 7th), then Ra1-a8 (Ra8#)."}],"explain":{"en":"The ladder mate is the fastest way to mate a lone king: one rook seals off a rank while the other checks on the next, pushing the king back rank by rank until the edge delivers mate."},"success":{"en":"Ladder complete — checkmate!"},"failHint":{"en":"Cut the 7th rank with one rook, mate on the 8th with the other."},"xp":30,"difficulty":2,"opponent":true},{"id":"s6-draw-1","stage":6,"set":"s6-draw","group":"Drawing techniques","themes":["endgame","stalemate","draw"],"mode":"free-move","type":"free-move","title":{"en":"Save the game with stalemate"},"intro":{"en":"Losing badly? If you have no pieces left, stalemate can steal a draw. Find it."},"goalText":{"en":"Stalemate the black king — secure the half-point."},"fen":"7k/8/6K1/8/8/8/8/Q7 w - - 0 1","movePieces":["q"],"goal":{"stalemate":true},"par":1,"maxMoves":5,"hints":[{"en":"With only a queen left to move, stalemate is your friend."},{"en":"Cover g8 and h7 without checking the king on h8."},{"en":"Play Qa1-a2 (Qa2 — stalemate; the queen covers g8, your king covers h7 and g7)."}],"explain":{"en":"When you are lost, check for stalemate tricks: leave the opponent with no legal move and no check. A queen can often force stalemate against a bare king if the defender plays accurately (here, Qa2 — the diagonal covers g8 while the king seals h7 and g7)."},"success":{"en":"Stalemate! From lost to draw — great save."},"failHint":{"en":"Place the queen so it covers g8 and h7 but does not check h8."},"xp":30,"difficulty":1,"opponent":true}]};


/* ── js/storage.js ─────────────────────────────────────────────── */
__def("storage", function () {
const __exports = {};
/**
 * js/storage.js — versioned progress persistence for DoChess.
 *
 * Single source of truth: localStorage key "dochess:v1".
 * - Every read is try/catch + shape-checked. Blocked/corrupt storage falls
 *   back to an in-memory backend (with `backend.blocked === true`) so the
 *   course keeps working; the UI can offer JSON export so nothing is lost.
 * - Legacy `ccp_v4[_userId]` data ({done:[ids]}) is preserved verbatim under
 *   state.legacy.v4done on first load; id-to-level star mapping happens in
 *   a later batch once the full curriculum exists.
 * - Pure functions take an explicit `backend` ({get,set,del}) so tests can
 *   inject a mock. Default backend wraps window.localStorage safely.
 */

const SCHEMA_VERSION = 1;
const STORAGE_KEY = 'dochess:v1';
const LEGACY_PREFIX = 'ccp_v4'; // legacy values: {done:[1..10]}

/** Blank progress state. Only plain JSON values (exportable as-is). */
function defaultState() {
    return {
        version: SCHEMA_VERSION,
        stars: {},        // levelId -> 0..3
        attempts: {},     // levelId -> {tries,hintsUsed,solvedAt}
        accuracy: {},     // theme -> {ok,n}
        leitner: {},      // levelId -> {box:1..5,due:ISO,fails}
        streak: { count: 0, lastDay: null }, // lastDay: "YYYY-MM-DD"
        heatmap: {},      // "YYYY-MM-DD" -> solved count
        xp: 0,
        level: 1,
        badges: [],
        rushBest: 0,
        daily: { date: null, levelId: null, done: false },
        settings: {
            theme: 'night', pieces: 'classic', board: 'brown',
            coords: true, sound: false, lang: 'en',
        },
        legacy: {},       // migrated old keys, preserved verbatim
    };
}

/** Shape check: true only if `s` looks like a v1 state. Repairs nothing. */
function isValidState(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
    if (s.version !== SCHEMA_VERSION) return false;
    for (const k of ['stars', 'attempts', 'accuracy', 'leitner', 'heatmap']) {
        if (!s[k] || typeof s[k] !== 'object' || Array.isArray(s[k])) return false;
    }
    if (!s.streak || typeof s.streak.count !== 'number') return false;
    if (!s.settings || typeof s.settings !== 'object') return false;
    if (typeof s.xp !== 'number' || typeof s.level !== 'number') return false;
    if (!Array.isArray(s.badges)) return false;
    return true;
}

/** Safe storage backend. Falls back to memory when localStorage is blocked. */
function safeBackend() {
    const mem = new Map();
    try {
        const ls = window.localStorage;
        ls.getItem('__dochess_probe__'); // throws when blocked
        return {
            blocked: false,
            get: (k) => ls.getItem(k),
            set: (k, v) => { try { ls.setItem(k, v); } catch (_) {} },
            del: (k) => { try { ls.removeItem(k); } catch (_) {} },
        };
    } catch (_) {
        return {
            blocked: true,
            get: (k) => (mem.has(k) ? mem.get(k) : null),
            set: (k, v) => { mem.set(k, v); },
            del: (k) => { mem.delete(k); },
        };
    }
}

/** Load progress: stored v1 -> legacy migration -> blank default. Never throws. */
function loadProgress(backend = safeBackend()) {
    try {
        const raw = backend.get(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (isValidState(parsed)) return { state: parsed, backend };
        }
    } catch (_) { /* fall through to migration/default */ }
    // One-time legacy migration (verbatim preserve, no star mapping yet).
    const migrated = defaultState();
    try {
        const legacyRaw = backend.get(LEGACY_PREFIX);
        if (legacyRaw) {
            const legacy = JSON.parse(legacyRaw);
            if (legacy && Array.isArray(legacy.done)) {
                migrated.legacy.v4done = legacy.done.filter((n) => Number.isInteger(n));
            }
        }
    } catch (_) {}
    return { state: migrated, backend };
}

/** Persist state. Never throws (quota/blocked writes are swallowed). */
function saveProgress(state, backend = safeBackend()) {
    try {
        backend.set(STORAGE_KEY, JSON.stringify(state));
        return true;
    } catch (_) {
        return false;
    }
}

/** Serialize for the Export button (download as dochess-progress.json). */
function exportProgress(state) {
    return JSON.stringify(state, null, 2);
}

/**
 * Parse an imported file. Returns {ok:true, state} or {ok:false, error}.
 * Refuses wrong-version and malformed payloads instead of merging blindly.
 */
function importProgress(jsonText) {
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    } catch (_) {
        return { ok: false, error: 'not-json' };
    }
    if (!isValidState(parsed)) return { ok: false, error: 'bad-schema' };
    return { ok: true, state: parsed };
}

/** Clear progress (call only after user confirms). Keeps settings. */
function resetProgress(backend = safeBackend()) {
    let settings = null;
    try {
        const raw = backend.get(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && parsed.settings) settings = parsed.settings;
    } catch (_) {}
    const fresh = defaultState();
    if (settings) fresh.settings = { ...fresh.settings, ...settings };
    saveProgress(fresh, backend);
    return fresh;
}

// ── small helpers used by engine/review (thin, no policy inside) ──

function todayKey(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Record a calendar day of activity; maintains streak across exactly-1-day gaps. */
function touchDay(state, dayKey = todayKey()) {
    state.heatmap[dayKey] = (state.heatmap[dayKey] || 0) + 1;
    if (state.streak.lastDay === dayKey) return state.streak.count;
    const prev = state.streak.lastDay;
    let consecutive = false;
    if (prev) {
        const ms = Date.parse(dayKey) - Date.parse(prev);
        consecutive = ms === 86400000;
    }
    state.streak.count = consecutive ? state.streak.count + 1 : 1;
    state.streak.lastDay = dayKey;
    return state.streak.count;
}

/**
 * Free-move scoring (Lichess-learn style: fewer moves = more points).
 * Stars come ONLY from move count vs par; hints cost points, never stars.
 */
const POINTS_BASE = 100;
const POINTS_PER_EXTRA_MOVE = 10;
const HINT_POINT_COST = 15;

function starsForPar(moves, par) {
    if (!Number.isFinite(moves) || !Number.isFinite(par)) return 0;
    if (moves <= par) return 3;
    if (moves <= par + 2) return 2;
    return 1;
}

function pointsFor({ moves, par, hintsUsed = 0 }) {
    const over = Math.max(0, moves - par);
    return Math.max(0, POINTS_BASE - POINTS_PER_EXTRA_MOVE * over - HINT_POINT_COST * Math.max(0, hintsUsed));
}

/** XP with level = 1 + floor(xp/150). Returns {xp, level, leveledUp}. */
function addXp(state, amount) {
    const before = state.level;
    state.xp += Math.max(0, amount | 0);
    state.level = 1 + Math.floor(state.xp / 150);
    return { xp: state.xp, level: state.level, leveledUp: state.level > before };
}

__exports.defaultState = defaultState;
__exports.isValidState = isValidState;
__exports.safeBackend = safeBackend;
__exports.loadProgress = loadProgress;
__exports.saveProgress = saveProgress;
__exports.exportProgress = exportProgress;
__exports.importProgress = importProgress;
__exports.resetProgress = resetProgress;
__exports.todayKey = todayKey;
__exports.touchDay = touchDay;
__exports.starsForPar = starsForPar;
__exports.pointsFor = pointsFor;
__exports.addXp = addXp;
__exports.SCHEMA_VERSION = SCHEMA_VERSION;
__exports.STORAGE_KEY = STORAGE_KEY;
__exports.LEGACY_PREFIX = LEGACY_PREFIX;
__exports.POINTS_BASE = POINTS_BASE;
__exports.POINTS_PER_EXTRA_MOVE = POINTS_PER_EXTRA_MOVE;
__exports.HINT_POINT_COST = HINT_POINT_COST;
return __exports;
});

/* ── js/lessons.js ─────────────────────────────────────────────── */
__def("lessons", function () {
const __exports = {};
/**
 * js/lessons.js — curriculum loader + validators for DoChess.
 *
 * Data lives in data/lessons.json. NOTHING level-specific may live in code:
 * adding a level = appending JSON. Two validation layers:
 *
 *  1. validateSchema(data) — pure structure/type checks, no chess needed.
 *     English text is required; fr/ar fall back to en at runtime, so a
 *     missing translation is a WARNING, never an error.
 *  2. validateEngine(data, api) — chess checks via an injected engine API,
 *     so the same runner works with chess.js in the browser and with the
 *     legacy engine in node. `api.load(fen)` must return a game object:
 *       {
 *         listMoves(): [{from:'e2', to:'e4', uci:'e2e4'}],  // side to move
 *         play(uci): boolean,                              // apply, false if illegal
 *         isCheckmate(): boolean,
 *       }
 *     Single-move types (tactics stages; `mode` omitted or "single-move"):
 *       reach-square {piece?, target}  — some legal (piece-filtered) move lands on target.
 *       best-move {moves:[uci]}        — every listed move is legal from the start FEN.
 *       mate-in-1 {moves:[uci], acceptAlso?:[uci]} — listed moves mate, and NO
 *         other legal move mates unless listed in acceptAlso.
 *       capture-all {targets:[sq]}    — each target holds an enemy piece that
 *         some legal move captures.
 *       defend / avoid-stalemate      — STRUCTURAL ONLY for now (honest skip,
 *         enforced properly when the opponent-reply runtime lands in engine.js).
 *     Free-move levels (`mode":"free-move"`, Lichess-learn style): the player
 *       moves repeatedly while the side to move is forced back to the player
 *       after every move. Goals mix freely:
 *         goal: {collect:[sq], capture:[sq], reach:{square, piece?}}
 *       Rules: `movePieces` allowlist (frozen pieces are obstacles), `obstacles`
 *       squares (never crossed nor landed on), `avoidAttacked` (landing on an
 *       enemy-attacked square is rejected), `par` (BFS-verified, never trusted),
 *       `maxMoves` safety cap. Stars/points come from move count vs par.
 *       `"opponent": true` adds a real enemy reply after every player move:
 *       a deterministic policy shared by the runtime (engine.js) and the BFS,
 *       so par is computed on exactly the chess the player will face.
 *
 * PAR IS COMPUTED, NOT TYPED: solveFreeMove() BFS-searches the shortest
 * player-move sequence satisfying the goal. Validation FAILS when the stored
 * par differs, when the goal is unreachable, or when a collect square is
 * blocked — and prints the optimal line(s). The same solver powers the
 * in-game "Show solution" button.
 *
 * Run in the browser console (after chess.js is vendored):
 *   const api = ChessJsAdapter(); // batch 2
 *   console.table(runAllTests(lessonsJson, api));
 */

const CURRICULUM_VERSION = 2;
const LEVEL_TYPES = [
    'reach-square', 'capture-all', 'best-move',
    'mate-in-n', 'defend', 'avoid-stalemate',
    'free-move', // Lichess-learn style: repeated moves toward a goal (mode:"free-move")
];

/** Global star rule (one rule for every level — not per-level data). */
const STAR_RULES = {
    3: 'solved on the first try with no hints',
    2: 'solved within 2 tries or with 1 hint',
    1: 'solved',
};

/** Stars earned from an attempt. Pure function of tries/hints. */
function starsForAttempt({ solved, tries, hintsUsed }) {
    if (!solved) return 0;
    if (tries <= 1 && hintsUsed <= 0) return 3;
    if (tries <= 2 || hintsUsed <= 1) return 2;
    return 1;
}

const FEN_RE = /^[rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+ [wb] (-|[KQkq]+) (-|[a-h][36]) \d+ \d+$/;
const SQ_RE = /^[a-h][1-8]$/;
const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

function t(field, path, errors, warnings, what) {
    if (field === undefined) { errors.push(`${path}: missing ${what}`); return null; }
    if (typeof field === 'string') return { en: field };
    if (typeof field !== 'object' || Array.isArray(field)) { errors.push(`${path}: bad ${what}`); return null; }
    if (typeof field.en !== 'string' || !field.en.trim()) errors.push(`${path}: ${what}.en required`);
    for (const lang of ['fr', 'ar']) {
        if (typeof field[lang] !== 'string' || !field[lang].trim()) {
            warnings.push(`${path}: ${what}.${lang} missing (falls back to en)`);
        }
    }
    return field;
}

/** Validate one level's structure. Pushes into errors/warnings, returns void. */
function validateLevelSchema(lv, seen, errors, warnings) {
    const id = (lv && typeof lv.id === 'string') ? lv.id : '(missing id)';
    const path = `level ${id}`;
    if (!lv || typeof lv !== 'object') { errors.push(`${path}: not an object`); return; }
    if (typeof lv.id !== 'string' || !lv.id) { errors.push('level: id must be a non-empty string'); return; }
    if (seen.has(lv.id)) errors.push(`${path}: duplicate id`);
    seen.add(lv.id);
    if (!Number.isInteger(lv.stage)) errors.push(`${path}: stage must be an integer`);
    if (!Array.isArray(lv.themes) || lv.themes.length === 0) errors.push(`${path}: themes[] required`);
    // planned lessons are skeletons ("Coming soon"): type/mode may be omitted.
    if (lv.planned !== true && !LEVEL_TYPES.includes(lv.type)) {
        errors.push(`${path}: unknown type ${JSON.stringify(lv.type)}`);
    }
    t(lv.title, path, errors, warnings, 'title');
    if (lv.set !== undefined && (typeof lv.set !== 'string' || !lv.set)) {
        errors.push(`${path}: set must be a non-empty string`);
    }
    if (lv.difficulty !== undefined && !(lv.difficulty >= 1 && lv.difficulty <= 3)) {
        errors.push(`${path}: difficulty must be 1, 2 or 3`);
    }
    // planned lessons: skeleton only ("Coming soon" in the UI). No FEN, goal,
    // hints, par or xp — everything chess-specific is skipped; they are
    // excluded from progress totals and never validated against an engine.
    if (lv.planned === true) {
        t(lv.explain, path, errors, warnings, 'explain');
        if (lv.goalText !== undefined) t(lv.goalText, path, errors, warnings, 'goalText');
        return;
    }
    if (lv.mode === 'free-move') {
        t(lv.goalText, path, errors, warnings, 'goalText');
    } else {
        t(lv.goal, path, errors, warnings, 'goal');
    }
    t(lv.explain, path, errors, warnings, 'explain');
    t(lv.success, path, errors, warnings, 'success');
    t(lv.failHint, path, errors, warnings, 'failHint');
    if (typeof lv.fen !== 'string' || !FEN_RE.test(lv.fen.trim())) {
        errors.push(`${path}: bad FEN`);
    }
    if (!Array.isArray(lv.hints) || lv.hints.length < 3) {
        errors.push(`${path}: need at least 3 progressive hints`);
    } else {
        lv.hints.forEach((h, i) => t(h, `${path}.hints[${i}]`, errors, warnings, 'hint'));
    }
    if (typeof lv.xp !== 'number' || lv.xp < 0) errors.push(`${path}: xp must be a number >= 0`);
    if (lv.mode !== undefined && lv.mode !== 'free-move' && lv.mode !== 'single-move') {
        errors.push(`${path}: mode must be free-move or single-move`);
    }
    if (lv.group !== undefined && (typeof lv.group !== 'string' || !lv.group)) {
        errors.push(`${path}: group must be a non-empty string`);
    }
    if (lv.intro !== undefined) t(lv.intro, path, errors, warnings, 'intro');
    if (lv.mode === 'free-move') {
        const g = lv.goal && typeof lv.goal === 'object' && !Array.isArray(lv.goal) ? lv.goal : null;
        if (!g) errors.push(`${path}: goal object required for free-move ({collect,capture,reach,check,mate,stalemate})`);
        else {
            const hasCollect = Array.isArray(g.collect) && g.collect.length > 0;
            const hasCapture = Array.isArray(g.capture) && g.capture.length > 0;
            const hasReach = g.reach && typeof g.reach.square === 'string';
            const hasFlag = g.check === true || g.mate === true || g.stalemate === true;
            if (!hasCollect && !hasCapture && !hasReach && !hasFlag) {
                errors.push(`${path}: goal needs collect[], capture[], reach.square or check/mate/stalemate true`);
            }
            for (const s of [...(g.collect || []), ...(g.capture || [])]) {
                if (!SQ_RE.test(s)) errors.push(`${path}: bad goal square ${s}`);
            }
            if (g.reach) {
                if (!SQ_RE.test(g.reach.square)) errors.push(`${path}: bad reach.square`);
                if (g.reach.piece !== undefined && !/^[prnbqk]$/i.test(g.reach.piece)) {
                    errors.push(`${path}: bad reach.piece`);
                }
            }
            for (const flag of ['check', 'mate', 'stalemate']) {
                if (g[flag] !== undefined && typeof g[flag] !== 'boolean') {
                    errors.push(`${path}: goal.${flag} must be boolean`);
                }
            }
            if (g.mate === true && g.stalemate === true) {
                errors.push(`${path}: goal cannot demand both mate and stalemate`);
            }
        }
        if (lv.obstacles !== undefined && (!Array.isArray(lv.obstacles) || !lv.obstacles.every((s) => SQ_RE.test(s)))) {
            errors.push(`${path}: obstacles must be squares[]`);
        }
        if (lv.movePieces !== undefined && (!Array.isArray(lv.movePieces) || !lv.movePieces.every((p) => /^[prnbqk]$/i.test(p)))) {
            errors.push(`${path}: movePieces must be piece letters[]`);
        }
        if (lv.avoidAttacked !== undefined && typeof lv.avoidAttacked !== 'boolean') {
            errors.push(`${path}: avoidAttacked must be boolean`);
        }
        if (lv.opponent !== undefined && typeof lv.opponent !== 'boolean') {
            errors.push(`${path}: opponent must be boolean`);
        }
        if (!Number.isInteger(lv.par) || lv.par < 1) errors.push(`${path}: par (integer >= 1) required, BFS-verified`);
        if (lv.maxMoves !== undefined && (!Number.isInteger(lv.maxMoves) || lv.maxMoves < lv.par)) {
            errors.push(`${path}: maxMoves must be an integer >= par`);
        }
    }
    // Type-specific required fields.
    if (lv.type === 'reach-square') {
        if (typeof lv.target !== 'string' || !SQ_RE.test(lv.target)) errors.push(`${path}: target square required`);
        if (lv.piece !== undefined && !/^[prnbqk]$/i.test(lv.piece)) errors.push(`${path}: bad piece filter`);
    }
    if (lv.type === 'best-move' || lv.type === 'mate-in-n') {
        if (!lv.solution || !Array.isArray(lv.solution.moves) || lv.solution.moves.length === 0) {
            errors.push(`${path}: solution.moves[] required`);
        } else if (!lv.solution.moves.every((m) => typeof m === 'string' && UCI_RE.test(m))) {
            errors.push(`${path}: solution.moves must be UCI like e2e4`);
        }
        if (lv.solution && lv.solution.acceptAlso !== undefined &&
            (!Array.isArray(lv.solution.acceptAlso) || !lv.solution.acceptAlso.every((m) => UCI_RE.test(m)))) {
            errors.push(`${path}: solution.acceptAlso must be UCI list`);
        }
        if (lv.type === 'mate-in-n' && (!lv.solution || !Number.isInteger(lv.solution.mateIn) || lv.solution.mateIn < 1)) {
            errors.push(`${path}: solution.mateIn >= 1 required`);
        }
    }
    if (lv.type === 'capture-all') {
        if (!Array.isArray(lv.targets) || lv.targets.length === 0 || !lv.targets.every((s) => SQ_RE.test(s))) {
            errors.push(`${path}: targets[] squares required`);
        }
    }
}

/** Full schema pass over the curriculum file. */
function validateSchema(data) {
    const errors = [], warnings = [];
    if (!data || typeof data !== 'object') return { errors: ['root: not an object'], warnings };
    if (data.version !== CURRICULUM_VERSION) errors.push(`root: version must be ${CURRICULUM_VERSION}`);
    if (!Array.isArray(data.stages) || data.stages.length === 0) errors.push('root: stages[] required');
    if (!Array.isArray(data.levels) || data.levels.length === 0) errors.push('root: levels[] required');
    if (!Array.isArray(data.sets) || data.sets.length === 0) errors.push('root: sets[] required');
    const stageNos = new Set((data.stages || []).map((s) => s.n));
    const setIds = new Set();
    for (const set of data.sets || []) {
        if (!set || typeof set.id !== 'string' || !set.id) { errors.push('sets[]: each set needs a string id'); continue; }
        if (setIds.has(set.id)) errors.push(`set ${set.id}: duplicate id`);
        setIds.add(set.id);
        if (!Number.isInteger(set.stage) || !stageNos.has(set.stage)) {
            errors.push(`set ${set.id}: stage ${set.stage} not in stages[]`);
        }
        t(set.title, `set ${set.id}`, errors, warnings, 'title');
        if (set.desc !== undefined) t(set.desc, `set ${set.id}`, errors, warnings, 'desc');
    }
    const seen = new Set();
    for (const lv of data.levels || []) {
        validateLevelSchema(lv, seen, errors, warnings);
        if (Number.isInteger(lv.stage) && !stageNos.has(lv.stage)) {
            errors.push(`level ${lv.id}: stage ${lv.stage} not in stages[]`);
        }
        if (lv.set !== undefined && !setIds.has(lv.set)) {
            errors.push(`level ${lv.id}: set ${JSON.stringify(lv.set)} not in sets[]`);
        }
    }
    // Every set must own at least one level (otherwise the UI shows an empty card).
    for (const set of data.sets || []) {
        if (set && set.id && !(data.levels || []).some((l) => l.set === set.id)) {
            errors.push(`set ${set.id}: no levels reference it`);
        }
    }
    return { errors, warnings };
}

/** Engine pass. Returns [{id, type, status:'pass'|'fail'|'skip', detail}]. */
function validateEngine(data, api) {
    const out = [];
    for (const lv of data.levels || []) {
        try {
            out.push(checkLevel(lv, api));
        } catch (e) {
            out.push({ id: lv.id, type: lv.type, status: 'fail', detail: `exception: ${String(e && e.message || e).slice(0, 120)}` });
        }
    }
    return out;
}

/* ── free-move geometry (no engine needed) ───────────────────────────
   pathBetween(): squares strictly BETWEEN from and to on straight/diagonal
   lines (exclusive of endpoints). [] for adjacent steps, null for
   non-sliding geometry (knight jumps). Shared by solver and game runtime. */
function _fileRank(sq) {
    return { f: sq.charCodeAt(0) - 97, r: 8 - parseInt(sq[1], 10) };
}
function _sqOf(f, r) {
    return String.fromCharCode(97 + f) + (8 - r);
}
function pathBetween(from, to) {
    const a = _fileRank(from), b = _fileRank(to);
    const df = b.f - a.f, dr = b.r - a.r;
    if (df === 0 && dr === 0) return [];
    if (df !== 0 && dr !== 0 && Math.abs(df) !== Math.abs(dr)) return null;
    const steps = Math.max(Math.abs(df), Math.abs(dr));
    const out = [];
    for (let i = 1; i < steps; i++) {
        out.push(_sqOf(a.f + Math.sign(df) * i, a.r + Math.sign(dr) * i));
    }
    return out;
}

/* ── deterministic defender ("opponent": true levels) ───────────────
   After every player move the enemy answers with ONE move chosen from the
   position. The same function runs in the runtime (engine.js) and inside
   solveFreeMove(), so par/stars are computed on exactly the chess the
   player will face.

   Pure function of the position - no randomness, no clock: candidates are
   scored with integer arithmetic and ties break on UCI order, so chess.js
   in the browser and the legacy engine in node always pick the same move.

   Hard rules (the coach plays back but never ruins the lesson):
     - never mates or stalemates the player
     - never captures the piece standing on goal.reach.square
     - never MOVES a piece standing on a goal.capture square (the target
       stays put until the player takes it)
     - never leaves the player with zero legal moves under the level's own
       rules (obstacles + movePieces allowlist - covers king-capture
       soft-locks and obstacle-blocked checks alike)
   Scoring, highest wins: captures, checks, promotions, central squares,
   minus hanging the piece it just moved. */
const DEF_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function defCenterBonus(sq) {
    const f = sq.charCodeAt(0) - 97;
    const r = parseInt(sq[1], 10) - 1;
    const df = Math.abs(f - 3.5), dr = Math.abs(r - 3.5);
    if (df <= 1 && dr <= 1) return 2;
    if (df <= 2.5 && dr <= 2.5) return 1;
    return 0;
}

function defLevelLegal(m, allowed, obstacles) {
    const mover = (m.piece || '').toLowerCase();
    if (allowed.size && !allowed.has(mover)) return false;
    if (m.to === m.from) return false;
    if (obstacles.has(m.to)) return false;
    const between = pathBetween(m.from, m.to);
    return !(between && between.some((s) => obstacles.has(s)));
}

/** Pick the defender's reply. `g` must be a full solver-surface game whose
 *  side to move is the defender (turn is set defensively here anyway).
 *  Returns a UCI string (promotion suffix included) or null. */
function chooseDefenderMove(level, g, player) {
    const enemy = player === 'w' ? 'b' : 'w';
    const goal = level.goal || {};
    const obstacles = new Set(level.obstacles || []);
    const allowed = new Set((level.movePieces || []).map((s) => s.toLowerCase()));
    const reachSq = goal.reach ? goal.reach.square : null;
    const captureSquares = new Set(goal.capture || []);
    const lastRank = enemy === 'w' ? '8' : '1';

    let moves;
    try {
        g.setTurn(enemy);
        moves = g.listDetailed();
    } catch (_) { return null; }
    if (!moves || !moves.length) return null;

    const isPlayerLetter = (letter) => !!letter &&
        (player === 'w' ? letter === letter.toUpperCase() : letter === letter.toLowerCase());

    // Deterministic candidate list: UCI order, defender always queens.
    const cands = [];
    for (const m of moves) {
        const piece = (m.piece || '').toLowerCase();
        const promo = (piece === 'p' && m.to[1] === lastRank) ? 'q' : null;
        cands.push({ uci: m.from + m.to + (promo || ''), piece, from: m.from, to: m.to });
    }
    cands.sort((a, b) => (a.uci < b.uci ? -1 : a.uci > b.uci ? 1 : 0));

    let best = null;
    for (const c of cands) {
        // Leave the lesson's targets alone.
        const victim = g.pieceOn(c.to);
        if (victim && isPlayerLetter(victim) && c.to === reachSq) continue;
        if (captureSquares.has(c.from)) continue;
        const snap = g.snapshot();
        let rec = null;
        try {
            g.setTurn(enemy);
            rec = g.playDetailed(c.uci.slice(0, 4), c.uci[4] || undefined);
        } catch (_) { rec = null; }
        if (!rec) { g.restore(snap); continue; }
        if (rec.mate || rec.stalemate) { g.restore(snap); continue; }
        // The player must always still have a move under the level's rules.
        try {
            g.setTurn(player);
            if (!g.listDetailed().some((m2) => defLevelLegal(m2, allowed, obstacles))) {
                g.restore(snap);
                continue;
            }
        } catch (_) { /* engine hiccup: keep the candidate */ }
        let hanging = false;
        try { hanging = g.attacked(c.to, player === 'w' ? 'white' : 'black'); } catch (_) { hanging = false; }
        let score = 0;
        if (rec.captured) score += 10 * (DEF_VALUES[String(rec.captured).toLowerCase()] || 1);
        if (rec.check) score += 4;
        if (rec.promotion) score += 3;
        score += defCenterBonus(c.to);
        if (hanging) score -= 6 * (DEF_VALUES[c.piece] || 1);
        g.restore(snap);
        // Strict > keeps the FIRST best, and candidates are UCI-ordered.
        if (!best || score > best.score) best = { uci: c.uci, score };
    }
    return best ? best.uci : null;
}

/* ── BFS solver for free-move levels ─────────────────────────────────
   Extra-turn rule: after every player move the side to move is forced back
   to the player (same rule the game runtime uses). Only the player's moves
   are searched; enemy pieces never move.
   api.load(fen) game must ALSO provide (beyond the base surface):
     setTurn('w'|'b'), boardKey(), attacked(sq, 'white'|'black'),
     pieceOn(sq), epSquare() (algebraic or null), snapshots via snapshot()/restore().
   Returns {reachable, par, lines:[[uci...]] (up to 3 optimal), expanded,
            failReason}. uci carries a promotion suffix (e7e8q) when promoted. */
const SOLVER_NODE_BUDGET = 200000;

function solveFreeMove(level, api, maxDepth) {
    const goal = level.goal || {};
    const wantCollect = new Set(goal.collect || []);
    const wantCapture = new Set(goal.capture || []);
    const reach = goal.reach || null;
    const obstacles = new Set(level.obstacles || []);
    const avoidAttacked = !!level.avoidAttacked;
    const allowed = new Set((level.movePieces || []).map((s) => s.toLowerCase()));
    const cap = Math.min(maxDepth || level.maxMoves || 12, 15);

    for (const s of wantCollect) {
        if (obstacles.has(s)) {
            return { reachable: false, par: null, lines: [], expanded: 0, failReason: `collect square ${s} is blocked by obstacles` };
        }
    }

    const start = api.load(level.fen);
    if (!start) return { reachable: false, par: null, lines: [], expanded: 0, failReason: 'FEN did not load' };
    const player = start.turn() === 'b' ? 'b' : 'w';
    const enemyName = player === 'w' ? 'black' : 'white';
    const isPlayerPiece = (p) => !!p && (player === 'w' ? p === p.toUpperCase() : p === p.toLowerCase());

    const missing = [...wantCapture].filter((sq) => {
        const victim = start.pieceOn(sq);
        return !victim || isPlayerPiece(victim);
    });
    if (missing.length) {
        return { reachable: false, par: null, lines: [], expanded: 0, failReason: `capture target(s) hold no enemy piece: ${missing.join(',')}` };
    }

    // Squares already satisfied at start (own piece sitting on a star counts).
    const startColl = [...wantCollect].filter((sq) => isPlayerPiece(start.pieceOn(sq)));
    if (wantCollect.size > 0 && startColl.length === wantCollect.size && wantCapture.size === 0 && !reach) {
        return { reachable: true, par: 0, lines: [[]], expanded: 0, failReason: null };
    }

    const keyOf = (game, coll, cap) =>
        game.boardKey() + '|' + [...coll].sort().join(',') + '|' + [...cap].sort().join(',');

    const goalMet = (coll, cap, lastMove) => {
        for (const s of wantCollect) if (!coll.has(s)) return false;
        for (const s of wantCapture) if (!cap.has(s)) return false;
        if (reach) {
            if (!lastMove || lastMove.to !== reach.square) return false;
            if (reach.piece && lastMove.mover !== reach.piece.toLowerCase() &&
                lastMove.promoted !== reach.piece.toLowerCase()) return false;
        }
        // Opponent-state goals: flags captured right after the move, before the
        // turn rewrite — they describe the ENEMY king (check/mate/stalemate).
        if (goal.check === true && !(lastMove && lastMove.check)) return false;
        if (goal.mate === true && !(lastMove && lastMove.mate)) return false;
        if (goal.stalemate === true && !(lastMove && lastMove.stalemate)) return false;
        return true;
    };

    const visited = new Set();
    const queue = [{ snap: start.snapshot(), coll: new Set(startColl), cap: new Set(), path: [], last: null }];
    visited.add(keyOf(start, new Set(startColl), new Set()));
    let expanded = 0;
    const solutions = [];

    const g = api.load(level.fen); // scratch game, repositioned per node
    while (queue.length) {
        const node = queue.shift();
        if (node.path.length >= cap) continue;
        g.restore(node.snap);
        g.setTurn(player);
        let moves;
        try {
            moves = g.listDetailed();
        } catch (_) {
            continue;
        }
        for (const m of moves) {
            const mover = (m.piece || '').toLowerCase();
            if (allowed.size && !allowed.has(mover)) continue;
            if (m.to === m.from) continue;
            if (obstacles.has(m.to)) continue;
            const between = pathBetween(m.from, m.to);
            if (between && between.some((s) => obstacles.has(s))) continue;
            // Expand promotions (pawn reaching the last rank chooses a piece).
            const lastRank = (player === 'w' && m.to[1] === '8') || (player === 'b' && m.to[1] === '1');
            const promos = (mover === 'p' && lastRank) ? ['q', 'r', 'b', 'n'] : [null];
            for (const promo of promos) {
                g.restore(node.snap);
                g.setTurn(player);
                let rec;
                try {
                    rec = g.playDetailed(m.uci, promo);
                } catch (_) {
                    continue;
                }
                if (!rec) continue;
                const uci = m.uci + (promo || '');
                if (avoidAttacked) {
                    let bad = false;
                    try {
                        bad = g.attacked(m.to, enemyName);
                    } catch (_) {
                        bad = false;
                    }
                    if (bad) continue;
                }
                const coll = new Set(node.coll);
                const capSet = new Set(node.cap);
                if (wantCollect.has(m.to)) coll.add(m.to);
                if (rec.captured) {
                    const capSq = rec.epCapture || m.to;
                    if (wantCapture.has(capSq)) capSet.add(capSq);
                }
                const lastMove = {
                    to: m.to, mover, promoted: promo,
                    check: !!(rec && rec.check), mate: !!(rec && rec.mate), stalemate: !!(rec && rec.stalemate),
                };
                if (goalMet(coll, capSet, lastMove)) {
                    solutions.push([...node.path, uci]);
                    if (solutions.length >= 3) {
                        return {
                            reachable: true, par: node.path.length + 1, lines: solutions,
                            expanded, failReason: null,
                        };
                    }
                    continue; // keep BFS layer complete for par honesty
                }
                if (node.path.length + 1 >= cap) continue;
                // Opponent reply: the defender answers from the exact policy
                // the runtime uses, then the extra-turn rule hands the move
                // back to the player (mirrors engine.js). Only player moves
                // count toward par; the reply is part of the transition.
                if (level.opponent) {
                    const replyUci = chooseDefenderMove(level, g, player);
                    if (replyUci) {
                        try { g.playDetailed(replyUci.slice(0, 4), replyUci[4] || undefined); } catch (_) { /* keep position */ }
                    }
                    g.setTurn(player);
                }
                const key = keyOf(g, coll, capSet);
                if (visited.has(key)) continue;
                visited.add(key);
                queue.push({ snap: g.snapshot(), coll, cap: capSet, path: [...node.path, uci], last: lastMove });
                if (++expanded > SOLVER_NODE_BUDGET) {
                    return { reachable: false, par: null, lines: [], expanded, failReason: `search budget exceeded (${SOLVER_NODE_BUDGET} nodes)` };
                }
            }
        }
        if (solutions.length) {
            return {
                reachable: true, par: node.path.length + 1, lines: solutions,
                expanded, failReason: null,
            };
        }
    }
    return {
        reachable: solutions.length > 0, par: solutions.length ? solutions[0].length : null,
        lines: solutions, expanded,
        failReason: solutions.length ? null : `goal unreachable within ${cap} moves`,
    };
}

function checkLevel(lv, api) {
    const fail = (detail) => ({ id: lv.id, type: lv.type, status: 'fail', detail });
    const pass = (detail) => ({ id: lv.id, type: lv.type, status: 'pass', detail });
    const skip = (detail) => ({ id: lv.id, type: lv.type, status: 'skip', detail });
    if (lv.planned === true) return skip('planned lesson (Coming soon) — no engine check');
    if (lv.mode === 'free-move') {
        if (typeof api.load !== 'function' || typeof api.load(lv.fen)?.setTurn !== 'function') {
            return skip('needs full solver API (setTurn/attacked/snapshot) — chess.js adapter in batch 2');
        }
        const res = solveFreeMove(lv, api);
        if (!res.reachable) return fail(res.failReason || 'unreachable');
        const shown = res.lines.slice(0, 2).map((l) => l.join(' ')).join('  |  ');
        if (lv.par !== res.par) {
            return fail(`stored par ${lv.par} != BFS par ${res.par} — optimal: ${shown}`);
        }
        if (lv.maxMoves !== undefined && res.par > lv.maxMoves) {
            return fail(`par ${res.par} exceeds maxMoves ${lv.maxMoves}`);
        }
        return pass(`par ${res.par} (${res.expanded} nodes): ${shown}`);
    }
    const game = api.load(lv.fen);
    if (!game) return fail('FEN did not load');
    const legal = game.listMoves(); // uci strings, side to move

    if (lv.type === 'reach-square') {
        const piece = (lv.piece || '').toLowerCase();
        const hits = legal.filter((uci) => uci.slice(2, 4) === lv.target);
        if (hits.length === 0) return fail(`nothing reaches ${lv.target}`);
        if (piece) {
            // Piece filter check needs the mover: replay each hit on a clone.
            const byPiece = hits.filter((uci) => {
                const g2 = api.load(lv.fen);
                const mover = g2.pieceOn ? g2.pieceOn(uci.slice(0, 2)) : null;
                return mover && mover.toLowerCase() === piece;
            });
            if (byPiece.length === 0) return fail(`no ${piece} reaches ${lv.target}`);
            return pass(`${byPiece.length} ${piece}-move(s) reach ${lv.target}`);
        }
        return pass(`${hits.length} move(s) reach ${lv.target}`);
    }

    if (lv.type === 'best-move') {
        const illegal = lv.solution.moves.filter((m) => !legal.includes(m));
        if (illegal.length) return fail(`solution illegal: ${illegal.join(',')}`);
        return pass(`${lv.solution.moves.length}/${legal.length} listed moves legal`);
    }

    if (lv.type === 'mate-in-n') {
        if (lv.solution.mateIn !== 1) return skip('multi-move mates enforced with engine.js runtime (batch 2)');
        const allowed = new Set([...lv.solution.moves, ...(lv.solution.acceptAlso || [])]);
        const mating = [];
        for (const uci of legal) {
            const g2 = api.load(lv.fen);
            if (!g2.play(uci)) continue;
            if (g2.isCheckmate()) mating.push(uci);
        }
        const unlisted = mating.filter((m) => !allowed.has(m));
        if (unlisted.length) return fail(`unlisted mates exist: ${unlisted.join(',')}`);
        const listedMiss = lv.solution.moves.filter((m) => !mating.includes(m));
        if (listedMiss.length) return fail(`listed move does not mate: ${listedMiss.join(',')}`);
        return pass(`mate via ${mating.join(',') || '(none?)'} — unique as listed`);
    }

    if (lv.type === 'capture-all') {
        if (!api.load(lv.fen).pieceOn) return skip('needs pieceOn() (lands with chess.js adapter)');
        const g2 = api.load(lv.fen);
        const bad = lv.targets.filter((sq) => {
            const victim = g2.pieceOn(sq);
            if (!victim) return true;
            return !legal.some((uci) => uci.slice(2, 4) === sq);
        });
        if (bad.length) return fail(`uncapturable targets: ${bad.join(',')}`);
        return pass(`${lv.targets.length} targets capturable`);
    }

    return skip(`${lv.type}: enforced with engine.js runtime (batch 2)`);
}

/** Combined runner for the browser console. Returns {schema, engine}. */
function runAllTests(data, api) {
    const schema = validateSchema(data);
    const engine = api ? validateEngine(data, api) : null;
    const fails = (engine || []).filter((r) => r.status === 'fail');
    if (typeof console !== 'undefined') {
        console.log(`[lessons] schema: ${schema.errors.length} error(s), ${schema.warnings.length} warning(s)`);
        schema.errors.forEach((e) => console.error('  schema ERROR: ' + e));
        if (engine) {
            const skipped = engine.filter((r) => r.status === 'skip').length;
            console.log(`[lessons] engine: ${engine.length - fails.length - skipped} pass, ${fails.length} fail, ${skipped} skip`);
            engine.forEach((r) => console.log(`  ${r.status.toUpperCase()} ${r.id}: ${r.detail}`));
        } else {
            console.log('[lessons] engine: skipped (no chess adapter — batch 2 wires chess.js)');
        }
    }
    return { schema, engine };
}

/** Fetch + schema-check the curriculum file. Throws on schema errors. */
async function loadLessons(url = 'data/lessons.json') {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`lessons fetch ${res.status} at ${url}`);
    const data = await res.json();
    const { errors } = validateSchema(data);
    if (errors.length) throw new Error(`lessons schema: ${errors[0]}`);
    return data;
}

__exports.loadLessons = loadLessons;
__exports.starsForAttempt = starsForAttempt;
__exports.validateSchema = validateSchema;
__exports.validateEngine = validateEngine;
__exports.pathBetween = pathBetween;
__exports.chooseDefenderMove = chooseDefenderMove;
__exports.solveFreeMove = solveFreeMove;
__exports.runAllTests = runAllTests;
__exports.CURRICULUM_VERSION = CURRICULUM_VERSION;
__exports.LEVEL_TYPES = LEVEL_TYPES;
__exports.STAR_RULES = STAR_RULES;
return __exports;
});

/* ── js/engine.js ─────────────────────────────────────────────── */
__def("engine", function () {
const __exports = {};
/**
 * js/engine.js — free-move level runtime on chess.js + solver adapter.
 *
 * Extra-turn rule (per spec): after every player move the FEN turn field is
 * rewritten back to the player, so one side moves repeatedly while chess.js
 * still enforces full legality (pins, check, pawn rules...). Own move counter
 * is kept separately because FEN reloads discard chess.js history.
 *
 * Also exports ChessJsAdapter(): the lessons.js solver surface
 * (turn/setTurn/boardKey/attacked/epSquare/listDetailed/playDetailed/
 * snapshot/restore/pieceOn) backed by chess.js 0.10.3 — used by "Show
 * solution" and by runAllTests() in the browser console.
 */

const { pathBetween, solveFreeMove, chooseDefenderMove } = __req("lessons");
const { starsForPar, pointsFor } = __req("storage");

const PROMO_PIECES = ['q', 'r', 'b', 'n'];
const EMPTY = [];

/* ── Tolerant FEN load (vendor quirk) ─────────────────────────────────
   chess.js 0.10.3 load() REJECTS an en-passant square no enemy pawn can
   actually take (e.g. after our own d2d4 with no black pawn nearby) and
   returns false WITHOUT touching the position. A silent no-op here is
   catastrophic: the game object keeps its old turn/position and every
   later move misbehaves (pieces report zero legal moves). In free-move
   the enemy never replies, so a stale EP square is meaningless — retry
   with it cleared. An EP capture can never be destroyed this way: EP
   rights only ever arise from OUR OWN double push on the previous move,
   and we can never capture our own pawn. */
function loadTolerant(g, fen) {
    try { if (g.load(fen)) return true; } catch (_) {}
    try {
        const parts = String(fen).split(' ');
        if (parts[3] && parts[3] !== '-') {
            parts[3] = '-';
            if (g.load(parts.join(' '))) return true;
        }
    } catch (_) {}
    try { if (typeof console !== 'undefined' && console.warn) console.warn('[DoChess] FEN load failed even sanitized:', String(fen).slice(0, 80)); } catch (_) {}
    return false;
}

/* ── chess.js adapter for the BFS solver ─────────────────────────────── */
function ChessJsAdapter(ChessCtor) {
    const enemyOf = (side) => (side === 'w' ? 'b' : 'w');
    const colorName = (side) => (side === 'w' ? 'white' : 'black');
    function wrap(fen) {
        const g = new ChessCtor(fen);
        const self = {
            turn() { return g.turn(); },
            setTurn(s) {
                const parts = g.fen().split(' ');
                parts[1] = s;
                loadTolerant(g, parts.join(' '));
            },
            snapshot: () => g.fen(),
            restore: (snap) => { loadTolerant(g, snap); },
            boardKey: () => g.fen(),
            pieceOn(sq) {
                const p = g.get(sq);
                return p ? (p.color === 'w' ? p.type.toUpperCase() : p.type) : null;
            },
            epSquare() {
                const ep = g.fen().split(' ')[3];
                return ep && ep !== '-' ? ep : null;
            },
            attacked(sq, byName) {
                const saved = g.fen();
                const want = byName === 'white' ? 'w' : 'b';
                try {
                    const parts = saved.split(' ');
                    parts[1] = want;
                    loadTolerant(g, parts.join(' '));
                    return g.moves({ verbose: true }).some((m) => m.to === sq);
                } finally {
                    loadTolerant(g, saved);
                }
            },
            listMoves() {
                return g.moves({ verbose: true })
                    .filter((m) => !(m.captured === 'k'))
                    .map((m) => m.from + m.to + (m.promotion || ''));
            },
            listDetailed() {
                return g.moves({ verbose: true })
                    .filter((m) => !(m.captured === 'k'))
                    .map((m) => ({
                        from: m.from, to: m.to, uci: m.from + m.to,
                        piece: m.piece, captured: m.captured || null,
                    }));
            },
            play(uci) {
                const res = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
                return !!res;
            },
            playDetailed(uci, promo) {
                const promotion = promo || uci[4] || undefined;
                let res;
                try {
                    res = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion });
                } catch (_) {
                    return null;
                }
                if (!res) return null;
                let epCapture = null;
                if (res.flags && res.flags.includes('e')) {
                    epCapture = res.to[0] + res.from[1];
                }
                // Opponent-state flags, read BEFORE any turn rewrite: after
                // g.move() the turn has already flipped to the opponent, so
                // in_check/in_checkmate/in_stalemate describe THEIR king.
                let check = false, mate = false, stalemate = false;
                try { check = g.in_check(); mate = g.in_checkmate(); stalemate = g.in_stalemate(); } catch (_) {}
                return { captured: res.captured || null, specialMove: null, promotion: res.promotion || null, epCapture, check, mate, stalemate };
            },
            isCheckmate: () => g.in_checkmate(),
            _game: g,
        };
        return self;
    }
    return { load: (fen) => { try { return wrap(fen); } catch (_) { return null; } }, enemyOf, colorName };
}

/* ── free-move level session ─────────────────────────────────────────── */
function createLevel(level, ChessCtor, lang = 'en') {
    const t = (obj, fb = '') => (obj && (obj[lang] || obj.en)) || fb;
    const player = (level.fen.split(' ')[1] === 'b') ? 'b' : 'w';
    const enemyName = player === 'w' ? 'black' : 'white';
    const adapter = ChessJsAdapter(ChessCtor);
    const game = new ChessCtor(level.fen);
    const obstacles = new Set(level.obstacles || []);
    const allowed = new Set((level.movePieces || []).map((s) => s.toLowerCase()));
    const goal = level.goal || {};
    const wantCollect = new Set(goal.collect || []);
    const wantCapture = new Set(goal.capture || []);
    const reach = goal.reach || null;

    const st = {
        level, game, adapter, player,
        collected: new Set(),
        captured: new Set(),
        moves: 0,
        hintsUsed: 0,
        hintIdx: 0,
        selected: null,
        done: false,
        result: null,
        undoStack: [], // {fen, collected:[], captured:[], moves}
        // Bumped on EVERY position/goal mutation. Derived reads (piece map,
        // legal move lists, check + king square) memoise against it, so the
        // click path — which asks for the same square up to four times per
        // move (select, target, play, paint) — pays chess.js for it once.
        version: 0,
    };

    // Derived-read cache. One generation per version; a bump invalidates all.
    const memo = { v: -1, pieces: null, legal: new Map(), check: false, king: null };

    function touch() {
        st.version++;
        memo.legal.clear();
    }
    // Stars already occupied at start count immediately.
    for (const sq of wantCollect) {
        const p = game.get(sq);
        if (p && p.color === player) st.collected.add(sq);
    }

    const isPlayerPiece = (p) => !!p && p.color === player;

    function attackedByEnemy(sq) {
        const saved = game.fen();
        try {
            const parts = saved.split(' ');
            parts[1] = player === 'w' ? 'b' : 'w';
            loadTolerant(game, parts.join(' '));
            return game.moves({ verbose: true }).some((m) => m.to === sq);
        } finally {
            loadTolerant(game, saved);
        }
    }

    /** Legal destinations for a selected square, with level rules applied. */
    function legalFor(sq) {
        if (memo.v !== st.version) { memo.v = st.version; memo.pieces = null; memo.check = null; memo.king = null; }
        const hit = memo.legal.get(sq);
        if (hit) return hit;
        const p = game.get(sq);
        if (!p || !isPlayerPiece(p)) return EMPTY;
        if (allowed.size && !allowed.has(p.type)) return EMPTY;
        const out = [];
        for (const m of game.moves({ square: sq, verbose: true })) {
            if (m.captured === 'k') continue;
            if (obstacles.has(m.to)) continue;
            const between = pathBetween(m.from, m.to);
            if (between && between.some((s) => obstacles.has(s))) continue;
            if (level.avoidAttacked && attackedByEnemy(m.to)) continue;
            out.push(m);
        }
        memo.legal.set(sq, out);
        return out;
    }

    function needsPromotion(from, to) {
        const p = game.get(from);
        if (!p || p.type !== 'p') return false;
        return (player === 'w' && to[1] === '8') || (player === 'b' && to[1] === '1');
    }

    function checkDone(lastTo, moverType, promoted, flags) {
        for (const s of wantCollect) if (!st.collected.has(s)) return false;
        for (const s of wantCapture) if (!st.captured.has(s)) return false;
        if (reach) {
            if (lastTo !== reach.square) return false;
            if (reach.piece && moverType !== reach.piece.toLowerCase() &&
                (promoted || '').toLowerCase() !== reach.piece.toLowerCase()) return false;
        }
        // Opponent-state goals: flags captured after game.move() BEFORE the
        // turn rewrite — they describe the enemy king (check/mate/stalemate).
        if (goal.check === true && !(flags && flags.check)) return false;
        if (goal.mate === true && !(flags && flags.mate)) return false;
        if (goal.stalemate === true && !(flags && flags.stalemate)) return false;
        return true;
    }

    function finish() {
        st.done = true;
        const stars = starsForPar(st.moves, level.par);
        const points = pointsFor({ moves: st.moves, par: level.par, hintsUsed: st.hintsUsed });
        st.result = { moves: st.moves, par: level.par, stars, points, hintsUsed: st.hintsUsed };
        return st.result;
    }

    return {
        state: st,
        text: (key) => t(level[key]),
        /** Attempt from→to (promotion piece like 'q' when required). */
        play(from, to, promotion) {
            if (st.done) return { ok: false, reason: 'done' };
            const legal = legalFor(from).filter((m) => m.to === to);
            if (!legal.length) return { ok: false, reason: 'illegal' };
            if (needsPromotion(from, to) && !PROMO_PIECES.includes((promotion || '').toLowerCase())) {
                return { ok: false, reason: 'promotion-needed' };
            }
            const mover = game.get(from);
            st.undoStack.push({
                fen: game.fen(),
                collected: [...st.collected], captured: [...st.captured], moves: st.moves,
            });
            const res = game.move({ from, to, promotion: promotion ? promotion.toLowerCase() : undefined });
            if (!res) return { ok: false, reason: 'illegal' };
            st.moves++;
            // Opponent-state flags: read BEFORE any turn rewrite — after
            // game.move() the turn has flipped to the opponent, so
            // in_check/in_checkmate/in_stalemate describe THEIR king.
            let flags = null;
            try {
                flags = {
                    check: game.in_check(),
                    mate: game.in_checkmate(),
                    stalemate: game.in_stalemate(),
                };
            } catch (_) { flags = null; }
            if (wantCollect.has(to)) st.collected.add(to);
            if (res.captured) {
                const capSq = res.flags && res.flags.includes('e') ? to[0] + from[1] : to;
                if (wantCapture.has(capSq)) st.captured.add(capSq);
            }
            st.selected = null;
            touch();
            // Goal check first: a solved level never gets a reply.
            const solved = checkDone(to, mover.type, res.promotion, flags);
            // Defender reply (levels flagged "opponent"): the enemy answers
            // through the SAME deterministic policy the BFS solver uses, so
            // the chess on screen is the chess par was computed on. One undo
            // reverts player move + reply together (single snapshot above).
            let reply = null;
            if (!solved && level.opponent) {
                let uci = null;
                try {
                    const probe = adapter.load(game.fen());
                    if (probe) uci = chooseDefenderMove(level, probe, player);
                } catch (_) { uci = null; }
                if (uci) {
                    try {
                        reply = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
                    } catch (_) { reply = null; }
                    if (reply) touch();
                }
            }
            // Extra-turn rule: force the turn back to the player (a reply
            // already flipped it home; without one this hands the move over).
            const parts = game.fen().split(' ');
            parts[1] = player;
            loadTolerant(game, parts.join(' '));
            if (solved) finish();
            return {
                ok: true, move: res, done: st.done, result: st.result,
                reply: reply ? { from: reply.from, to: reply.to, captured: reply.captured || null } : null,
            };
        },
        undo() {
            const prev = st.undoStack.pop();
            if (!prev) return false;
            loadTolerant(game, prev.fen);
            // Re-apply the extra-turn rule (loaded fen carries opponent turn).
            const parts = game.fen().split(' ');
            parts[1] = player;
            loadTolerant(game, parts.join(' '));
            st.collected = new Set(prev.collected);
            st.captured = new Set(prev.captured);
            st.moves = prev.moves;
            st.selected = null;
            st.done = false;
            st.result = null;
            touch();
            return true;
        },
        restart() {
            game.load(level.fen);
            st.collected = new Set();
            for (const sq of wantCollect) {
                const p = game.get(sq);
                if (p && p.color === player) st.collected.add(sq);
            }
            st.captured = new Set();
            st.moves = 0;
            st.hintsUsed = 0;
            st.hintIdx = 0;
            st.selected = null;
            st.done = false;
            st.result = null;
            st.undoStack = [];
            touch();
        },
        hint() {
            const hints = level.hints || [];
            if (st.hintIdx >= hints.length) return null;
            const h = t(hints[st.hintIdx], '');
            st.hintIdx++;
            st.hintsUsed++;
            return h;
        },
        /** Optimal line via the same BFS the validator uses. */
        solution() {
            return solveFreeMove(level, adapter);
        },
        legalFor,
        needsPromotion,
        pieces() {
            if (memo.v === st.version && memo.pieces) return memo.pieces;
            memo.v = st.version;
            // NOTE: chess.js 0.10.3 board() cells have no .square — derive it.
            const out = {};
            game.board().forEach((row, r) => {
                row.forEach((cell, c) => {
                    if (cell) out['abcdefgh'[c] + (8 - r)] = { type: cell.type, color: cell.color };
                });
            });
            memo.pieces = out;
            return out;
        },
        inCheck() {
            if (memo.v === st.version) return memo.check;
            memo.v = st.version;
            try {
                memo.check = game.in_check();
            } catch (_) {
                memo.check = false;
            }
            return memo.check;
        },
        kingSquare() {
            if (memo.v === st.version) return memo.king;
            memo.v = st.version;
            let found = null;
            game.board().forEach((row, r) => {
                row.forEach((cell, c) => {
                    if (cell && cell.type === 'k' && cell.color === player) {
                        found = 'abcdefgh'[c] + (8 - r);
                    }
                });
            });
            memo.king = found;
            return found;
        },
        enemyName,
    };
}

// Re-export for the console runner: runAllTests(data, ChessJsAdapter(Chess)).


__exports.ChessJsAdapter = ChessJsAdapter;
__exports.createLevel = createLevel;
__exports.solveFreeMove = solveFreeMove;
return __exports;
});

/* ── js/board.js ─────────────────────────────────────────────── */
__def("board", function () {
const __exports = {};
/**
 * js/board.js — incremental SVG/image chessboard for DoChess levels.
 *
 * Dumb view layer: squares are created ONCE, then synced in place from a
 * view object (no 64-node rebuilds, focus preserved). Game rules live in
 * engine.js; this file only renders + reports taps/keys/drags.
 *
 * Latency budget (moves must feel instant):
 *   - every write is diffed against the last painted state, so a move that
 *     changes 3 squares touches 3 squares instead of 64;
 *   - a piece node is REUSED (only its src swaps) so the browser never
 *     re-decodes a 15 KB SVG mid-move;
 *   - the glide overlay is transform-only and never blocks input.
 *
 * view = {
 *   pieces:  { e2: {type:'p', color:'w'}, ... },
 *   selected: 'e2' | null,
 *   legalTos: Set<string>,          // destination squares for the selection
 *   captureTos: Set<string>,        // subset that are captures (ring style)
 *   lastFrom, lastTo: square|null,
 *   checkSq: square|null,          // king to outline (non-color cue included)
 *   stars: Set<string>,            // uncollected goal stars
 *   targets: Set<string>,          // uncollected capture targets
 *   obstacles: Set<string>,        // lava squares
 *   reachSq: square|null,          // reach goal square
 *   rover: square,                 // roving-tabstop square
 *   prefix: string,                // image cache-buster, e.g. 'v1'
 *   glide: boolean,                // animate the moved piece (default true)
 * }
 *
 * onAction(sq) fires on tap / Enter / Space with the algebraic square.
 * Arrow keys / Home / End move the roving tab stop (flip-aware: no flip in
 * levels — white is always at the bottom).
 */

const FILES = 'abcdefgh';
const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

const reduceMotion = () => {
    try { return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (_) { return false; }
};

function squareName(r, c) {
    return FILES[c] + (8 - r);
}

function pieceImageSrc(type, color, prefix = 'v1') {
    const white = color === 'w';
    // Piece SET (folder) is chosen once in the Online lobby — js/pieces.js.
    if (typeof window !== 'undefined' && window.DoChessPieces) {
        return window.DoChessPieces.url(white ? String(type).toUpperCase() : String(type), prefix);
    }
    return `assets/pieces/${white ? 'white' : 'black'}-${PIECE_NAMES[type]}.svg?${prefix}`;
}

function pieceLabel(type, color) {
    return `${color === 'w' ? 'White' : 'Black'} ${PIECE_NAMES[type]}`;
}

function createBoard(el, { onAction, prefix = 'v1' } = {}) {
    el.innerHTML = '';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Chess board');
    const order = [];
    const sqIndex = {}; // "dr,dc" -> square element (no querySelector on the hot path)
    for (let dr = 0; dr < 8; dr++) {
        for (let dc = 0; dc < 8; dc++) {
            const sq = document.createElement('div');
            sq.className = 'chess-square white';
            sq.dataset.dr = String(dr);
            sq.dataset.dc = String(dc);
            sq.setAttribute('role', 'button');
            sq.setAttribute('tabindex', '-1');
            // Fixed identity (levels never flip): set once, never rewritten.
            sq.dataset.square = squareName(dr, dc);
            sq.dataset.row = String(dr);
            sq.dataset.col = String(dc);
            el.appendChild(sq);
            order.push(sq);
            sqIndex[dr + ',' + dc] = sq;
        }
    }
    const byIndex = (dr, dc) => sqIndex[dr + ',' + dc];

    // Last painted state per square. Everything the renderer writes is
    // diffed against this, so a move is O(changed squares), not O(64).
    const prev = order.map(() => ({
        cls: '', label: '', sel: false, dot: '', mark: '', file: '', rank: '', tab: '', pk: '', src: '',
    }));

    /* ── Decode every piece image once, before the first move ─────────
       A piece whose bitmap is not decoded yet paints one frame late, which
       reads as a stutter on the very first move of a level. Decoding all
       twelve up front (at idle) removes that class of lag entirely. ─────── */
    function preloadPieces() {
        const run = () => {
            for (const color of ['w', 'b']) {
                for (const type of ['p', 'n', 'b', 'r', 'q', 'k']) {
                    try {
                        const img = new Image();
                        img.decoding = 'async';
                        img.src = pieceImageSrc(type, color, prefix);
                        if (typeof img.decode === 'function') img.decode().catch(() => {});
                    } catch (_) {}
                }
            }
        };
        try {
            if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 });
            else setTimeout(run, 300);
        } catch (_) { setTimeout(run, 300); }
    }
    let roverEl = null;

    const bySquare = (name) => el.querySelector(`.chess-square[data-square="${name}"]`);

    const sqOf = (e) => {
        const t = e.target && e.target.closest ? e.target.closest('.chess-square') : null;
        return t && t.dataset.square ? t : null;
    };

    el.addEventListener('keydown', (e) => {
        const sq = sqOf(e);
        if (!sq) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (onAction) onAction(sq.dataset.square);
            return;
        }
        const dirs = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        let target = null;
        if (dirs[e.key]) {
            e.preventDefault();
            const dr = Math.max(0, Math.min(7, +sq.dataset.dr + dirs[e.key][0]));
            const dc = Math.max(0, Math.min(7, +sq.dataset.dc + dirs[e.key][1]));
            target = byIndex(dr, dc);
        } else if (e.key === 'Home') {
            e.preventDefault();
            target = byIndex(0, 0);
        } else if (e.key === 'End') {
            e.preventDefault();
            target = byIndex(7, 7);
        } else return;
        if (target) {
            // Synchronous focus is correct here: the keydown IS the user's
            // focus intent, and no paint can happen before it anyway.
            setRover(target);
            try { target.focus({ preventScroll: true }); } catch (_) { /* noop */ }
        }
    });

    function setRover(next) {
        if (roverEl && roverEl !== next) roverEl.setAttribute('tabindex', '-1');
        next.setAttribute('tabindex', '0');
        roverEl = next;
    }

    /* ── Drag-and-drop: same action path as click-click ─────────────
       A ghost follows the pointer once it clears the 10px slop; the drop
       square resolves to the same onAction(sq) call, so rules, undo and
       scoring are identical whichever gesture was used. A tap never
       travels far enough to start a drag, so click-click is untouched. ── */
    let drag = null;
    let swallowClick = false;
    el.addEventListener('click', (e) => {
        if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); return; }
        const sq = sqOf(e);
        if (sq && onAction) onAction(sq.dataset.square);
    });
    // A pointer gesture means the user is done with the roving stop: drop real
    // focus so no later focus() flush can be charged to a move.
    el.addEventListener('pointerdown', () => { keyboardUser = false; }, true);
    el.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button > 0) return;
        // Touch is handled by the touch* listeners below: under
        // `touch-action: manipulation` a finger drag gets claimed for
        // scrolling and the browser fires pointercancel mid-gesture, so a
        // pointer-based drag dies silently on phones.
        if (e.pointerType === 'touch') return;
        const sq = sqOf(e);
        if (!sq) return;
        const img = sq.querySelector('img.chess-piece');
        if (!img) return;
        drag = { sq, img, x0: e.clientX, y0: e.clientY, ghost: null, moved: false, id: e.pointerId, touch: false };
        noteDragStart();
    });
    /** Spawn the ghost under the pointer (pointer + touch share it). */
    function beginGhost(d, cx, cy) {
        const rect = d.img.getBoundingClientRect();
        const g = d.img.cloneNode();
        g.classList.add('drag-ghost');
        g.style.width = rect.width + 'px';
        g.style.height = rect.height + 'px';
        g.style.left = '0px';
        g.style.top = '0px';
        // Transform BEFORE append: no frame may render it at the CSS origin.
        g.style.transform = `translate(${cx - rect.width / 2}px, ${cy - rect.height / 2}px)`;
        document.body.appendChild(g);
        d.ghost = g;
        d.w = rect.width;
        d.h = rect.height;
        d.img.classList.add('is-dragging');
    }
    /** Follow the pointer (transform only — no layout per move). */
    function moveGhost(d, cx, cy) {
        if (!d.ghost) return;
        d.ghost.style.transform = `translate(${cx - d.w / 2}px, ${cy - d.h / 2}px)`;
    }

    el.addEventListener('pointermove', (e) => {
        const d = drag;
        if (!d || d.moved) return;
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) <= 10) return;
        d.moved = true;
        beginGhost(d, e.clientX, e.clientY);
        moveGhost(d, e.clientX, e.clientY);
        // Drag-start selects the piece — the same effect as the first click of
        // click-click — but ONLY when it is not selected yet. Calling it on an
        // already-selected square would toggle the selection back off.
        if (!d.sq.classList.contains('selected') && onAction) onAction(d.sq.dataset.square);
    });
    /* Keep the ghost under the pointer on every move (transform only). */
    el.addEventListener('pointermove', (e) => {
        const d = drag;
        if (d && d.moved) moveGhost(d, e.clientX, e.clientY);
    });
    /** Square under a client point, computed from the board box (immune to
        whatever element is painted on top, e.g. the drag ghost). */
    function squareAt(clientX, clientY) {
        const b = el.getBoundingClientRect();
        if (!(b.width > 0 && b.height > 0)) return null;
        const cell = b.width / 8;
        const dc = Math.floor((clientX - b.left) / cell);
        const dr = Math.floor((clientY - b.top) / cell);
        if (dc < 0 || dc > 7 || dr < 0 || dr > 7) return null;
        return byIndex(dr, dc);
    }
    // A drag also changes the board's page offset if the user auto-scrolls,
    // so the cached geometry must not survive one.
    const noteDragStart = () => invalidateGeometry();
    /* ── Touch drag ────────────────────────────────────────────────────
       Handled with raw touch events, NOT pointer events. Under
       `touch-action: manipulation` (needed so a tap can still scroll) the
       browser claims the gesture for panning and fires pointercancel as soon
       as the finger moves — which silently killed every finger drag while the
       mouse path worked fine. preventDefault() on touchmove once the finger
       has clearly left the start square (10px slop) keeps the gesture ours;
       below that slop we never preventDefault, so taps and page scrolling are
       unaffected. ──────────────────────────────────────────────────────── */
    let touchDrag = null;
    const SLOP = 10;

    el.addEventListener('touchstart', (e) => {
        if (touchDrag || e.touches.length !== 1) return;
        const t = e.touches[0];
        const sq = sqOf({ target: e.target });
        if (!sq) return;
        const img = sq.querySelector('img.chess-piece');
        if (!img) return;
        touchDrag = { sq, img, x0: t.clientX, y0: t.clientY, ghost: null, moved: false };
        noteDragStart();
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
        const d = touchDrag;
        if (!d || e.touches.length !== 1) return;
        const t = e.touches[0];
        if (!d.moved) {
            if (Math.hypot(t.clientX - d.x0, t.clientY - d.y0) <= SLOP) return; // still a tap/scroll
            d.moved = true;
            beginGhost(d, t.clientX, t.clientY);
            // Select on drag-start, exactly like the first click of click-click.
            if (!d.sq.classList.contains('selected') && onAction) onAction(d.sq.dataset.square);
        }
        // From here the gesture is unambiguously ours.
        if (e.cancelable) e.preventDefault();
        moveGhost(d, t.clientX, t.clientY);
    }, { passive: false });

    const endTouch = (e) => {
        const d = touchDrag;
        touchDrag = null;
        if (!d) return;
        const t = (e.changedTouches && e.changedTouches[0]) || null;
        if (!d.moved || !t) { if (d.ghost) d.ghost.remove(); return; }
        if (d.ghost) d.ghost.remove();
        d.img.classList.remove('is-dragging');
        swallowClick = true;
        const sq = squareAt(t.clientX, t.clientY);
        if (sq && onAction) onAction(sq.dataset.square);
    };
    el.addEventListener('touchend', endTouch);
    el.addEventListener('touchcancel', (e) => {
        const d = touchDrag;
        touchDrag = null;
        if (!d) return;
        if (d.ghost) d.ghost.remove();
        d.img.classList.remove('is-dragging');
    });

    const teardownDrag = () => {
        const d = drag;
        drag = null;
        if (!d) return null;
        if (d.ghost) d.ghost.remove();
        d.img.classList.remove('is-dragging');
        return d;
    };
    const endDrag = (e) => {
        const d = teardownDrag();
        if (!d) return;
        if (!d.moved) return; // a tap: the click handler already fired
        // pointerup is followed by a click on the drag origin — eat it.
        swallowClick = true;
        const sq = squareAt(e.clientX, e.clientY);
        if (sq && onAction) onAction(sq.dataset.square);
    };
    // Bound on the WINDOW, not the board: a pointerup whose cursor left the
    // board must still tear the drag down, or the ghost stays on screen and
    // the piece never drops.
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', teardownDrag);

    /* ── Piece nodes ─────────────────────────────────────────────────────
       The single biggest source of first-move jank: creating a NEW <img>
       per piece makes the browser decode a ~15 KB SVG during the click.
       Instead every piece identity keeps a small pool of <img> nodes, and
       moving a piece RELOCATES the node that already holds its decoded
       bitmap. appendChild of an existing node never re-decodes. ──────── */
    const pool = new Map(); // "wP" -> img[]
    function acquirePiece(key, type, color, src) {
        const free = pool.get(key);
        const node = (free && free.length) ? free.pop() : document.createElement('img');
        node.width = 45; node.height = 45;
        node.decoding = 'async';
        node.draggable = false;
        node.className = `chess-piece ${color === 'w' ? 'white' : 'black'}`;
        node.alt = pieceLabel(type, color);
        node.dataset.pk = key;
        // Lets the piece-set switch (js/pieces.js) repaint this node in
        // place, and the shared broken-image fallback replace it.
        node.dataset.fallbackPiece = color === 'w' ? type.toUpperCase() : type;
        // Only assign when it actually differs: a redundant src write can
        // invalidate the decoded bitmap.
        if (node.getAttribute('src') !== src) node.src = src;
        return node;
    }
    function releasePiece(node, key) {
        node.remove();
        let free = pool.get(key);
        if (!free) { free = []; pool.set(key, free); }
        if (free.length < 3) free.push(node);
    }

    /** Place the right piece on a square, moving/reusing nodes. */
    function syncPiece(i, sq, piece) {
        const st = prev[i];
        const img = sq.firstElementChild && sq.firstElementChild.classList.contains('chess-piece')
            ? sq.firstElementChild : null;
        if (!piece) {
            if (img) releasePiece(img, st.pk || '?');
            st.pk = ''; st.src = '';
            return;
        }
        const wantSrc = pieceImageSrc(piece.type, piece.color, prefix);
        const wantKey = `${piece.color}${piece.type}`;
        if (st.pk === wantKey && st.src === wantSrc && img) return; // unchanged
        if (img && st.pk === wantKey) {
            // Same piece identity, different square: relocate the node so the
            // decoded bitmap comes along for free.
            sq.prepend(img);
        } else {
            if (img) releasePiece(img, st.pk || '?');
            sq.prepend(acquirePiece(wantKey, piece.type, piece.color, wantSrc));
        }
        st.pk = wantKey;
        st.src = wantSrc;
    }

    /* ── Geometry cache ──────────────────────────────────────────────────
       getBoundingClientRect() inside a click handler forces a synchronous
       layout. The board is a fixed square grid, so ONE measurement plus the
       cell size derives every square box; it is re-read only when something
       can actually have changed (resize, scroll, orientation). ───────── */
    let geo = null;
    function invalidateGeometry() { geo = null; }
    if (typeof window !== 'undefined') {
        window.addEventListener('resize', invalidateGeometry);
        window.addEventListener('scroll', invalidateGeometry, true);
        window.addEventListener('orientationchange', invalidateGeometry);
    }
    /** Centre of a square in board-relative px, or null if not measurable.
        Geometry is only needed for the burst, so measuring is deferred until
        the first burst — the move path itself stays layout-read free. */
    function centreOf(name) {
        const f = FILES.indexOf(name[0]);
        const r = 8 - Number(name[1]);
        if (f < 0 || !(r >= 0 && r <= 7)) return null;
        if (!geo) {
            const b = el.getBoundingClientRect();
            geo = { cell: b.width / 8, ok: b.width > 0 && b.height > 0 };
        }
        if (!geo.ok) return null;
        return { x: f * geo.cell + geo.cell / 2, y: r * geo.cell + geo.cell / 2, cell: geo.cell };
    }

    /* ── Focus management ────────────────────────────────────────────────
       Following the roving tab stop with real DOM focus on every move is
       expensive: focus() forces a style+layout flush, and it is charged to
       the click that triggered it — which is exactly the "the board lags one
       move behind" feeling. Clicking a square DOES focus it, so "does the
       board hold focus?" is not a usable test.

       Instead: focus follows the piece only once the user has actually
       touched the keyboard, or when a caller asks for it explicitly
       (opening a level, so the first Tab lands in the right place). ───── */
    let keyboardUser = false;
    let focusQueued = false;
    let focusForced = false;
    el.addEventListener('keydown', () => { keyboardUser = true; }, true);

    function queueFocus(name, force) {
        if (force) focusForced = true;
        if (!force && !keyboardUser) { setRover(bySquare(name)); return; }
        if (focusQueued) return;
        focusQueued = true;
        const run = () => {
            focusQueued = false;
            const forced = focusForced;
            focusForced = false;
            const sq = bySquare(name);
            if (!sq || !el.contains(sq)) return;
            setRover(sq);
            const active = document.activeElement;
            if (!forced && (!active || !el.contains(active))) return;
            try { sq.focus({ preventScroll: true }); } catch (_) { /* noop */ }
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
        else setTimeout(run, 0);
    }

    /* ── Glide overlay: the moved piece flies from→to while the synced
       DOM is already correct, so the board is usable the whole time.
       Geometry comes from the cache above — no forced layout here. ── */
    function glide(from, to) {
        if (reduceMotion() || !from || !to || from === to) return;
        if (!el.isConnected) return;
        const dstEl = bySquare(to);
        if (!dstEl) return;
        const flying = dstEl.querySelector('img.chess-piece');
        if (!flying) return;
        const a = centreOf(from), c = centreOf(to);
        if (!a || !c) return;
        const size = a.cell * 0.85;
        const ghost = flying.cloneNode();
        ghost.classList.add('fly-piece');
        ghost.style.width = size + 'px';
        ghost.style.height = size + 'px';
        ghost.style.left = (c.x - size / 2) + 'px';
        ghost.style.top = (c.y - size / 2) + 'px';
        el.appendChild(ghost);
        const anim = ghost.animate(
            [
                { transform: `translate(${(a.x - c.x).toFixed(1)}px, ${(a.y - c.y).toFixed(1)}px)` },
                { transform: 'translate(0, 0)' },
            ],
            { duration: 190, easing: 'cubic-bezier(0.22, 0.68, 0.24, 1)', fill: 'both' }
        );
        const done = () => ghost.remove();
        anim.onfinish = done;
        setTimeout(done, 460);
    }

    /** One-shot celebration burst on a square (goal collected / captured).
        Fires right after a move, so it uses the cached geometry rather than
        forcing a layout read in the middle of the interaction. */
    function burst(sq, kind) {
        if (reduceMotion() || !sq) return;
        const host = bySquare(sq);
        if (!host) return;
        const c = centreOf(sq);
        if (!c) return;
        const wrap = document.createElement('span');
        wrap.className = 'goal-burst';
        wrap.dataset.kind = kind || 'star';
        const glyph = document.createElement('span');
        glyph.className = 'goal-burst-glyph';
        glyph.textContent = kind === 'target' ? '◎' : '★';
        wrap.appendChild(glyph);
        for (let i = 0; i < 8; i++) {
            const sp = document.createElement('i');
            const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
            const d = 30 + Math.random() * 26;
            sp.style.setProperty('--dx', `${(Math.cos(a) * d).toFixed(1)}px`);
            sp.style.setProperty('--dy', `${(Math.sin(a) * d).toFixed(1)}px`);
            sp.style.setProperty('--sd', `${(Math.random() * 60).toFixed(0)}ms`);
            wrap.appendChild(sp);
        }
        host.appendChild(wrap);
        setTimeout(() => wrap.remove(), 1000);
        host.classList.add('goal-hit');
        setTimeout(() => host.classList.remove('goal-hit'), 620);
    }

    const idxOf = (name) => {
        const f = FILES.indexOf(name[0]);
        const r = 8 - Number(name[1]);
        if (f < 0 || !(r >= 0 && r <= 7)) return -1;
        return r * 8 + f;
    };
    /** Piece that was painted on a square BEFORE this pass, as "wP" style key. */
    const pkOf = (name) => { const i = idxOf(name); return i < 0 ? '' : prev[i].pk; };

    function render(view) {
        const stars = view.stars || new Set();
        const targets = view.targets || new Set();
        const obstacles = view.obstacles || new Set();
        const legal = view.legalTos || new Set();
        const captures = view.captureTos || new Set();
        const glideMove = view.glide === false ? null
            : (view.lastFrom && view.lastTo && view.lastFrom !== view.lastTo ? { from: view.lastFrom, to: view.lastTo } : null);
        // A real move empties the from-square; undo/reset repaints do not.
        const hadPiece = glideMove ? !!pkOf(glideMove.from) : false;

        for (let i = 0; i < 64; i++) {
            const sq = order[i];
            const st = prev[i];
            const dr = +sq.dataset.dr, dc = +sq.dataset.dc;
            const r = dr, c = dc; // levels: white at bottom, no flip
            const name = squareName(r, c);

            // ── class list, diffed ──
            let cls = (r + c) % 2 === 0 ? 'chess-square white' : 'chess-square black';
            if (view.selected === name) cls += ' selected';
            if (view.lastFrom === name || view.lastTo === name) cls += ' last-move';
            if (view.checkSq === name) cls += ' in-check';
            if (obstacles.has(name)) cls += ' is-obstacle';
            if (view.reachSq === name) cls += ' is-reach';
            if (stars.has(name)) cls += ' has-star';
            if (targets.has(name)) cls += ' has-target';
            if (cls !== st.cls) { sq.className = cls; st.cls = cls; }

            // ── a11y, diffed ──
            const piece = view.pieces ? view.pieces[name] : null;
            const isCheck = view.checkSq === name;
            let label = piece ? `${name}, ${pieceLabel(piece.type, piece.color)}` : `${name}, empty`;
            if (isCheck) label += ', check';
            if (stars.has(name)) label += ', star';
            if (targets.has(name)) label += ', target';
            if (label !== st.label) { sq.setAttribute('aria-label', label); st.label = label; }

            if (view.selected === name) {
                if (!st.sel) { sq.setAttribute('aria-selected', 'true'); st.sel = true; }
            } else if (st.sel) {
                sq.removeAttribute('aria-selected');
                st.sel = false;
            }

            syncPiece(i, sq, piece);

            // legal indicators (single small node)
            const wantDot = legal.has(name);
            const wantDotCls = wantDot ? (captures.has(name) ? 'legal-ring' : 'legal-dot') : '';
            if (wantDotCls !== st.dot) {
                let dot = sq.querySelector('.legal-dot, .legal-ring');
                if (wantDotCls) {
                    if (!dot) {
                        dot = document.createElement('div');
                        dot.className = wantDotCls;
                        dot.setAttribute('aria-hidden', 'true');
                        sq.appendChild(dot);
                    } else if (dot.className !== wantDotCls) {
                        dot.className = wantDotCls;
                    }
                } else if (dot) dot.remove();
                st.dot = wantDotCls;
            }

            // goal markers (single small node)
            const wantStar = stars.has(name), wantTarget = targets.has(name);
            const wantMark = wantStar ? '★' : (wantTarget ? '◎' : '');
            if (wantMark !== st.mark) {
                let mark = sq.querySelector('.goal-mark');
                if (wantMark) {
                    if (!mark) {
                        mark = document.createElement('span');
                        mark.className = 'goal-mark';
                        mark.setAttribute('aria-hidden', 'true');
                        sq.appendChild(mark);
                    }
                    mark.textContent = wantMark;
                    mark.dataset.kind = wantStar ? 'star' : 'target';
                } else if (mark) mark.remove();
                st.mark = wantMark;
            }

            // coordinates on fixed display edges
            const wantFile = dr === 7 ? FILES[c] : '';
            if (wantFile !== st.file) {
                let fl = sq.querySelector('.coord-file');
                if (wantFile) {
                    if (!fl) { fl = document.createElement('span'); fl.className = 'coord-file'; sq.appendChild(fl); }
                    if (fl.textContent !== wantFile) fl.textContent = wantFile;
                } else if (fl) fl.remove();
                st.file = wantFile;
            }
            const wantRank = dc === 0 ? String(8 - r) : '';
            if (wantRank !== st.rank) {
                let rk = sq.querySelector('.coord-rank');
                if (wantRank) {
                    if (!rk) { rk = document.createElement('span'); rk.className = 'coord-rank'; sq.appendChild(rk); }
                    if (rk.textContent !== wantRank) rk.textContent = wantRank;
                } else if (rk) rk.remove();
                st.rank = wantRank;
            }

            // Roving tabindex (kept in sync by hand, no querySelectorAll).
            const tab = view.rover === name ? '0' : '-1';
            if (tab !== st.tab) { sq.setAttribute('tabindex', tab); st.tab = tab; }
            if (tab === '0') roverEl = sq;
        }

        // Glide only on a genuine move (the from-square actually emptied during
        // this pass), so undo/restart/level-switch repaints never animate.
        if (glideMove && hadPiece && !pkOf(glideMove.from)) glide(glideMove.from, glideMove.to);
    }

    preloadPieces();

    return {
        render,
        squareEl: bySquare,
        burst,
        focusSquare(name, force) { queueFocus(name, force); },
        destroy() { el.innerHTML = ''; },
    };
}
__exports.pieceImageSrc = pieceImageSrc;
__exports.pieceLabel = pieceLabel;
__exports.createBoard = createBoard;
return __exports;
});

/* ── js/focus.js ─────────────────────────────────────────────── */
__def("focus", function () {
const __exports = {};
/**
 * js/focus.js — "focus mode" for the Learn + Lessons boards.
 *
 * On a phone the board shares the viewport with a header, a goal card, a
 * speech bubble, a status strip, a six-button action row, a player card and
 * a whole dashboard (Brief, Why, Goal, hints, Move Log, result). The board is
 * the task; everything else is commentary.
 *
 * This module flips one class on the screen wrapper. Everything tagged
 * `data-focus-hide` in the markup disappears, the grid collapses to one
 * column, and the board takes the whole viewport — while a compact bar keeps
 * undo, "next" and the restore button one tap away. Nothing is re-rendered,
 * re-bound or unmounted, so toggling costs one class write.
 *
 * Desktop keeps everything: there is room for it and hiding it would be a
 * downgrade. The preference is remembered per screen and shared between
 * Learn and Lessons, because a player who wants a bare board wants a bare
 * board everywhere.
 */

const KEY = 'cc:focus';
const screens = ['learn-screen', 'lesson-screen'];

/**
 * Screens narrower than this keep focus mode; wider ones ignore it.
 *
 * MUST match the CSS breakpoints exactly. When it was 860 while the toggle
 * bar only appeared below 700, any width in between (landscape phones, small
 * tablets) entered focus mode with NO WAY BACK: the bar was hidden, so the
 * toggle was unreachable and every panel stayed hidden. A one-way door.
 */
const NARROW = 700;

let bound = false;

function readPref() {
    try {
        return localStorage.getItem(KEY) === '1';
    } catch (_) {
        return false;
    }
}

function writePref(on) {
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) { /* blocked */ }
}

/** The toggle lives inside whichever screen is on show. */
function toggleFor(root) {
    return root.querySelector('[data-focus-toggle]');
}

/**
 * Keep the disclosure semantics honest: aria-expanded describes whether the
 * collapsible content is showing, so it is FALSE when focus mode has hidden
 * it (aria-expanded=true + nothing on screen is a lie to a screen reader).
 */
function label(on, root) {
    const btn = toggleFor(root);
    if (!btn) return;
    btn.setAttribute('aria-expanded', on ? 'false' : 'true');
    btn.setAttribute('aria-label', on ? 'Show the full panel' : 'Hide everything except the board');
    btn.title = on ? 'Show full panel' : 'Focus mode';
}

function isFocusMode() {
    return readPref();
}

/** Apply the current preference to every screen (both share one setting). */
function applyFocusMode() {
    const on = readPref();
    for (const id of screens) {
        const el = document.getElementById(id);
        if (!el) continue;
        // Only phones get the toggle, so never force the class on desktop.
        const wide = window.innerWidth > NARROW;
        el.classList.toggle('lv-focus', on && !wide);
        label(on, el);
    }
    // Belt and braces: if a screen somehow ended up collapsed with no visible
    // toggle (e.g. markup edited mid-session, or a very short viewport), open
    // it back up. Focus mode must never be a one-way door.
    for (const id of screens) {
        const el = document.getElementById(id);
        if (!el || !el.classList.contains('lv-focus')) continue;
        if (el.classList.contains('active') && !visibleToggle(el)) {
            el.classList.remove('lv-focus');
        }
    }
}

/** Is there a toggle the user can actually reach inside this screen? */
function visibleToggle(root) {
    const btn = toggleFor(root);
    if (!btn) return false;
    const cs = window.getComputedStyle(btn);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = btn.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
}

function toggleFocusMode() {
    const next = readPref() ? '0' : '1';
    writePref(next === '1');
    applyFocusMode();
    const active = screens.map((id) => document.getElementById(id))
        .find((el) => el && el.classList.contains('active'));
    if (active) active.scrollIntoView({ block: 'nearest' });
    return next === '1';
}

/**
 * Wire the toggles. Delegated on the document so it works for markup that
 * app.js re-renders (the Lessons screen is rebuilt on every lesson open).
 */
function bootFocusMode() {
    if (bound) return;
    bound = true;
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-focus-toggle]');
        if (!btn) return;
        e.preventDefault();
        toggleFocusMode();
    });
    applyFocusMode();
    // A rotate or a window resize crosses the phone/desktop boundary.
    window.addEventListener('resize', applyFocusMode);
    window.addEventListener('orientationchange', applyFocusMode);
}
__exports.isFocusMode = isFocusMode;
__exports.applyFocusMode = applyFocusMode;
__exports.toggleFocusMode = toggleFocusMode;
__exports.bootFocusMode = bootFocusMode;
return __exports;
});

/* ── js/learn.js ─────────────────────────────────────────────── */
__def("learn", function () {
const __exports = {};
/**
 * js/learn.js — Learn screen wiring for index.html (the one and only site).
 *
 * Hosts the free-move curriculum (data/lessons.json) inside the homepage:
 * picker (grouped by piece, stars from dochess:v1) + level view. The level
 * view reuses the LESSONS screen anatomy verbatim — .lesson-detail-header,
 * .lesson-content(1fr/400px), .arena (goal card / speech bubble / board /
 * action row / player card) and a .lesson-dashboard — so both screens feel
 * like one product. Learn-only additions: goal markers on the board, a move
 * log, and the result card with stars.
 *
 * Coexists with the legacy app.js router: showing Learn hides the legacy
 * screens and highlights the Learn nav; any legacy nav click hides Learn
 * again (capture-phase hook, app.js handlers still run untouched).
 */

const { createBoard } = __req("board");
const { createLevel } = __req("engine");
const { loadProgress, saveProgress, addXp, touchDay } = __req("storage");
const { bootFocusMode, applyFocusMode } = __req("focus");

const $ = (id) => document.getElementById(id);

let DATA = null;
let store = loadProgress();
let sess = null;
let board = null;
let pendingPromo = null;
// View router: 'home' (stages + sets) → 'set' (lesson rows) → 'level'.
let view = 'home';
let currentSetId = null;

const lang = () => (store.state.settings && store.state.settings.lang) || 'en';
const T = (obj, fb = '') => (obj && (obj[lang()] || obj.en)) || fb;
const inLearn = () => $('learn-screen') && $('learn-screen').classList.contains('active');
const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* ── curriculum index (sets, progress, states) ─────────────────────────
   Planned lessons are locked "Coming soon" skeletons — excluded from every
   progress total so percentages stay honest. */
const playableLevels = () => (DATA ? DATA.levels.filter((l) => !l.planned) : []);
const levelsOfSet = (setId) => (DATA ? DATA.levels.filter((l) => l.set === setId) : []);
const setById = (setId) => (DATA ? DATA.sets.find((s) => s.id === setId) : null);

function starsOf(id) { return (store.state.stars && store.state.stars[id]) || 0; }

/** 'planned' | 'done' | 'progress' | 'new' */
function stateOf(lv) {
    if (lv.planned) return 'planned';
    if (starsOf(lv.id)) return 'done';
    if (store.state.attempts && store.state.attempts[lv.id]) return 'progress';
    return 'new';
}

function setStats(setId) {
    const lvs = levelsOfSet(setId).filter((l) => !l.planned);
    const done = lvs.filter((l) => starsOf(l.id)).length;
    return { total: lvs.length, done };
}

function overallStats() {
    const lvs = playableLevels();
    const done = lvs.filter((l) => starsOf(l.id)).length;
    return { total: lvs.length, done };
}

/** First unsolved playable level — the Continue CTA target. */
function firstUnsolved() {
    return playableLevels().find((l) => !starsOf(l.id)) || null;
}

const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const diffChip = (d) => {
    const n = d === 2 ? 2 : d === 3 ? 3 : 1;
    return `<span class="diff-chip d${n}">${DIFF_LABEL[n]}</span>`;
};

/* Set icons: one visual system per STAGE.
   Stage 1 shows real piece artwork on a checker chip (so white pieces stay
   legible). Stages 2+ use bold monochrome line icons — no emoji, works
   offline. Each stage owns an accent so the grid reads as six chapters. */
const SET_PIECE = { rook: 'r', bishop: 'b', queen: 'q', king: 'k', knight: 'n', pawn: 'p' };
const STAGE_ACCENT = {
    1: '#fbbf24', // gold — the pieces themselves
    2: '#38bdf8', // sky — the special rules
    3: '#fb7185', // rose — check & mate
    4: '#a78bfa', // violet — attack & defence
    5: '#34d399', // emerald — the endgame
    6: '#f97316'  // orange — mastery
};
const ICON_SVG = {
    castle: '<path d="M4.5 20.5h15M6.5 20.5v-8.2l1.6-1.6V6.2h2.2v2.6h3.4V6.2h2.2v4.5l1.6 1.6v8.2M10 20.5v-4.2h4v4.2"/><path d="M15.2 4.4l2.1 2.1-2.1 2.1"/>',
    ep: '<path d="M7.5 20.5h9M9.2 17.2h5.6l-1-3.4a2.9 2.9 0 10-3.6 0z"/><path d="M12 3.2v3.4M10.2 4.8L12 3l1.8 1.8"/><path d="M17.6 12.4l3 3-3 3"/>',
    crown: '<path d="M3.6 8.6l4.2 3.6L12 4.6l4.2 7.6 4.2-3.6-1.6 10.3H5.2z"/><path d="M5.2 21.6h13.6"/><path d="M9.6 15.4h4.8"/>',
    target: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><path d="M12 1.6v2.4M12 20v2.4M1.6 12H4M20 12h2.4"/>',
    mated: '<path d="M8.4 20.4h7.2"/><path d="M12 4.2l1.5 3.3 3.6.5-2.6 2.5.6 3.6-3.1-1.7-3.1 1.7.6-3.6-2.6-2.5 3.6-.5z"/><path d="M16.8 16.4l3.6 3.6M20.4 16.4l-3.6 3.6"/>',
    flag: '<path d="M6 21.4V3.2"/><path d="M6 4.4h11.4l-2.4 4 2.4 4H6"/><path d="M10 15.4h7.4l-2 3.4 2 3.4H10"/>',
    swords: '<path d="M3.4 3.4l8.6 8.6M20.6 3.4L12 12"/><path d="M14.2 12.8l2.6-2.6M9.8 12.8L7.2 10.2"/><path d="M4.2 19.8l3.4-3.4M19.8 19.8l-3.4-3.4"/><circle cx="12" cy="14.6" r="1.2" fill="currentColor" stroke="none"/>',
    shield: '<path d="M12 2.8l8 3v6.1c0 4.9-3.4 8.4-8 9.9-4.6-1.5-8-5-8-9.9V5.8z"/><path d="M8.6 12.2l2.6 2.6 4.2-4.6"/>',
    sunrise: '<path d="M3.2 19.4h17.6"/><path d="M6.2 15.6a5.8 5.8 0 1111.6 0"/><path d="M12 3.4v3.2M4.6 7.4l1.9 1.9M19.4 7.4l-1.9 1.9M2.4 12.4h2.4M19.2 12.4h2.4"/>'
};
function setIconHtml(set) {
    // PIECE_FILE (letter → artwork name) is defined once below with the
    // captured-material tray; stage-1 set icons are piece words ('rook'…).
    const letter = SET_PIECE[set.icon];
    if (letter) {
        const pieceChar = letter.toUpperCase();
        const src = (window.DoChessPieces && window.DoChessPieces.url(pieceChar, 'v24')) ||
            `assets/pieces/white-${PIECE_FILE[letter]}.svg?v24`;
        return `<img src="${src}" alt="" width="34" height="34" data-fallback-piece="${pieceChar}" draggable="false">`;
    }
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON_SVG[set.icon] || ICON_SVG.target}</svg>`;
}
function stageAccent(stage) { return STAGE_ACCENT[stage] || STAGE_ACCENT[1]; }

function showLearn() {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    const scr = $('learn-screen');
    if (!scr) return;
    scr.classList.add('active');
    // Re-apply focus mode: it is width-gated, and this may follow a resize.
    applyFocusMode();
    document.querySelectorAll('.nav-btn').forEach((b) => {
        const key = (b.dataset.nav || b.textContent.trim()).toLowerCase();
        b.classList.toggle('active', key.startsWith('learn'));
    });
    try { document.body.dataset.screen = 'learn-screen'; } catch (_) {}
    window.scrollTo(0, 0);
    try { scr.focus({ preventScroll: true }); } catch (_) {}
}

function hideLearn() {
    $('learn-screen')?.classList.remove('active');
    // Leaving Learn must not leave ?level=/?set= in the address bar —
    // otherwise Home/Lessons keep a stale deep link.
    clearLearnUrl();
    // Reset to the home view WITHOUT re-showing: showLearn() re-adds .active
    // — stacking Learn under every legacy screen navigated to mid-level.
    $('levelview').hidden = true;
    $('learn-heading').hidden = false;
    $('picker').hidden = false;
    view = 'home';
    currentSetId = null;
    renderHome();
}

/** Keep shareable deep links while a set/level is open; strip them on home. */
function setLearnUrl({ level = null, set = null } = {}) {
    const url = new URL(location.href);
    if (level) url.searchParams.set('level', level);
    else url.searchParams.delete('level');
    if (set) url.searchParams.set('set', set);
    else url.searchParams.delete('set');
    history.replaceState(null, '', url.pathname + url.search);
}

function clearLearnUrl() {
    const p = new URLSearchParams(location.search);
    if (!p.get('level') && !p.get('set')) return;
    setLearnUrl();
}

/* ── Stars ───────────────────────────────────────────────────────────────
   Row of 3 glyphs with the earned ones wrapped in .on, so CSS can pop each
   one individually instead of flashing a whole string. */
/** 3 star slots: earned ones filled ★ + gold, unearned hollow ☆ and dimmed.
    Both glyphs always carry an explicit colour (never "inherit") so the row
    is legible on any background. */
const starRow = (n) =>
    Array.from({ length: 3 }, (_, i) =>
        `<span class="${i < n ? 'on' : 'off'}">${i < n ? '★' : '☆'}</span>`).join('');

/** Star burst on the picker button that just gained stars. */
function popStars(btn) {
    if (!btn || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    btn.classList.add('just-scored');
    setTimeout(() => btn.classList.remove('just-scored'), 900);
}

/* ── Home view: overall progress + stage sections of set cards ────────── */
function renderHome() {
    const pk = $('picker');
    if (!pk || !DATA) return;
    view = 'home';
    currentSetId = null;
    const { total, done } = overallStats();
    const pct = total ? Math.round((done / total) * 100) : 0;
    const next = firstUnsolved();
    const nextSet = next ? setById(next.set) : null;
    const ctaLabel = next
        ? (done === 0 ? 'Start learning' : `Continue · ${T(next.title)}`)
        : 'All lessons cleared!';
    let html = `<div class="learn-home">
        <div class="learn-progress-panel">
            <div class="lp-num">${done}/${total}</div>
            <div class="lp-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Course progress">
                <div class="lp-fill" style="width:${pct}%"></div>
            </div>
            <div class="lp-sub">${pct}% cleared${nextSet ? ` · next: ${esc(T(nextSet.title))}` : ''}</div>
            <button class="btn-cta" id="continue-btn" type="button"${next ? '' : ' disabled'}>${esc(ctaLabel)}</button>
        </div>`;
    let gi = 0;
    for (const stage of DATA.stages) {
        const sets = DATA.sets.filter((s) => s.stage === stage.n);
        if (!sets.length) continue;
        html += `<section class="stage-block" aria-labelledby="stage-h-${stage.n}">
            <div class="stage-head">
                <span class="stage-n">Stage ${stage.n}</span>
                <h3 id="stage-h-${stage.n}">${esc(T(stage.title))}</h3>
                <p>${esc(T(stage.desc))}</p>
            </div>
            <div class="set-grid">`;
        sets.forEach((set, si) => {
            const st = setStats(set.id);
            const spct = st.total ? Math.round((st.done / st.total) * 100) : 0;
            const delay = Math.min(300, (gi * 3 + si) * 24);
            const locked = st.total === 0;
            html += `<div class="set-card${locked ? ' locked' : ''}" data-set="${esc(set.id)}" role="button" tabindex="0"
                        style="animation-delay:${delay}ms" aria-label="${esc(T(set.title))}: ${st.done} of ${st.total} done">
                    <div class="set-icon-wrap" data-stage="${set.stage}" aria-hidden="true">${setIconHtml(set)}</div>
                    <div class="set-info">
                        <h3>${esc(T(set.title))}</h3>
                        <p>${esc(T(set.desc))}</p>
                        <div class="set-progress">
                            <div class="sp-bar"><div class="sp-fill" style="width:${spct}%"></div></div>
                            <span class="sp-num">${st.done}/${st.total}${locked ? ' · soon' : ''}</span>
                        </div>
                    </div>
                    <button class="btn-secondary set-open" type="button" data-set-open="${esc(set.id)}"${locked ? ' disabled' : ''}>${st.done ? 'Review' : (locked ? 'Soon' : 'Open')}</button>
                </div>`;
        });
        html += `</div></section>`;
        gi++;
    }
    html += `</div>`;
    pk.innerHTML = html;
    pk.querySelectorAll('[data-set]').forEach((card) => {
        const open = () => { if (!card.classList.contains('locked')) openSet(card.dataset.set); };
        card.addEventListener('click', open);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
        });
    });
    const cta = $('continue-btn');
    if (cta && next) cta.addEventListener('click', () => openLevel(next.id));
}

/* ── Set view: one row per lesson (number, title, goal, difficulty, stars) ─ */
function renderSetView(setId) {
    const pk = $('picker');
    const set = setById(setId);
    if (!pk || !DATA || !set) { renderHome(); return; }
    view = 'set';
    currentSetId = setId;
    const st = setStats(setId);
    const spct = st.total ? Math.round((st.done / st.total) * 100) : 0;
    const lvs = levelsOfSet(setId);
    let html = `<div class="set-view">
        <button class="btn-secondary" id="set-back" type="button">← All stages</button>
        <div class="set-hero">
            <div class="set-icon-wrap big" data-stage="${set.stage}" aria-hidden="true">${setIconHtml(set)}</div>
            <div class="set-info">
                <span class="stage-n">Stage ${set.stage}</span>
                <h3>${esc(T(set.title))}</h3>
                <p>${esc(T(set.desc))}</p>
                <div class="set-progress">
                    <div class="sp-bar"><div class="sp-fill" style="width:${spct}%"></div></div>
                    <span class="sp-num">${st.done}/${st.total} cleared</span>
                </div>
            </div>
        </div>
        <ol class="lesson-rows">`;
    let n = 0;
    for (const lv of lvs) {
        const state = stateOf(lv);
        const isPlan = state === 'planned';
        if (!isPlan) n++;
        const stars = isPlan ? 0 : starsOf(lv.id);
        const cta = state === 'done' ? 'Replay' : state === 'progress' ? 'Improve' : 'Start';
        const delay = Math.min(320, n * 26);
        html += `<li class="lesson-row ${state}" data-lv-row="${esc(lv.id)}" style="animation-delay:${delay}ms">
            <span class="lr-num" aria-hidden="true">${isPlan ? '·' : n}</span>
            <div class="lr-main">
                <div class="lr-title">${esc(T(lv.title))}${isPlan ? '' : diffChip(lv.difficulty)}</div>
                <div class="lr-goal">${esc(T(lv.goalText || lv.explain))}</div>
            </div>
            ${isPlan ? '' : `<span class="stars" aria-label="${stars} of 3 stars">${starRow(stars)}</span>`}
            ${isPlan
                ? `<span class="lr-soon">Coming soon</span>`
                : `<button class="btn-primary lr-open" type="button" data-lv-open="${esc(lv.id)}">${cta}</button>`}
        </li>`;
    }
    html += `</ol></div>`;
    pk.innerHTML = html;
    $('set-back')?.addEventListener('click', showPickerHome);
    pk.querySelectorAll('[data-lv-open]').forEach((b) => {
        b.addEventListener('click', (e) => { e.stopPropagation(); openLevel(b.dataset.lvOpen); });
    });
}

function openSet(setId) {
    if (!setById(setId)) return;
    setLearnUrl({ set: setId });
    showLearn();
    $('levelview').hidden = true;
    $('learn-heading').hidden = false;
    $('picker').hidden = false;
    renderSetView(setId);
    window.scrollTo(0, 0);
}

function openLevel(id) {
    const lv = DATA.levels.find((l) => l.id === id);
    if (!lv || lv.planned) return;
    // Every entry counts as an attempt (tries), recorded additively.
    try {
        const a = store.state.attempts[id] || (store.state.attempts[id] = { tries: 0, hintsUsed: 0, solvedAt: null });
        a.tries += 1;
        saveProgress(store.state, store.backend);
    } catch (_) {}
    setLearnUrl({ level: id, set: lv.set });
    showLearn();
    view = 'level';
    currentSetId = lv.set || null;
    $('learn-heading').hidden = true;
    $('levelview').hidden = false;
    $('picker').hidden = true;

    // ── header (same slots as the Lessons screen header) ──
    const idx = DATA.levels.findIndex((l) => l.id === id);
    $('lv-num').textContent = String(idx + 1);
    $('lv-title').textContent = T(lv.title);
    $('lv-goal').textContent = T(lv.goalText);
    $('lv-group').textContent = lv.group || 'stage';
    $('lv-stars').innerHTML = starRow(starsOf(id));
    $('lv-explain').textContent = T(lv.explain);
    $('lv-brief').textContent = T(lv.goalText);
    $('par').textContent = lv.par;
    // Opening state of the achievement strip: stars already banked here.
    showAchievement(starsOf(id), '', '', false);

    // ── goal card: name the concrete objective + a pip per goal square ──
    const g = lv.goal || {};
    const pips = [];
    (g.collect || []).forEach((s) => pips.push({ sq: s, kind: '' }));
    (g.capture || []).forEach((s) => pips.push({ sq: s, kind: 'target' }));
    if (g.reach) pips.push({ sq: g.reach.square, kind: 'target' });
    $('lv-opp-name').textContent = g.reach && !g.collect && !g.capture
        ? `Reach ${g.reach.square}`
        : (g.capture && g.capture.length ? `Capture ${g.capture.join(', ')}` : `Visit ${(g.collect || []).join(', ')}`);
    $('lv-opp-sub').textContent = `${(lv.themes || []).join(' · ')}`;
    $('lv-goal-track').innerHTML = pips.map((x) => `<span class="pip ${x.kind}" data-sq="${x.sq}"></span>`).join('');

    $('result').hidden = true;
    $('result').classList.remove('show');
    $('solve-text').textContent = '';
    $('hint-text').textContent = '';
    // Speech bubble = the coach's voice (level intro). Feedback strip = status.
    say(lv.intro ? T(lv.intro) : (T(lv.goalText) || 'Pick your piece to begin.'));
    feedback('info', 'Pick your piece to begin.');

    sess = createLevel(lv, window.Chess, lang());
    pendingPromo = null;
    $('promo-row').hidden = true;
    logMoves = [];
    renderLog();
    buildCapturedTray();
    if (!board) {
        // Same image cache-buster as the Lessons board, so the 12 piece SVGs
        // app.js already decoded at boot are reused instead of re-fetched.
        const prefix = (window.app && typeof window.app._pieceFile === 'function' && window.app.constructor.assetV)
            ? window.app.constructor.assetV() : 'v24';
        board = createBoard($('play-board'), { onAction: onSquare, prefix });
    }
    paint();
    updateNextBtn();
    // Keep the screen on the board: showLearn() pins the page to the top,
    // which strands the board below the fold on most screens. Center it on
    // the board like the Lessons screen does (one instant jump after layout,
    // so it never fights the focus call below).
    requestAnimationFrame(() => {
        try { document.getElementById('play-board-wrap')?.scrollIntoView({ block: 'center' }); } catch (_) {}
    });
    // Forced: on a freshly opened level the board does not hold focus yet, so
    // the first Tab must land on the piece the level expects.
    board.focusSquare(firstOwnSquare(), true);
}

function showPickerHome() {
    clearLearnUrl();
    showLearn();
    $('levelview').hidden = true;
    $('learn-heading').hidden = false;
    $('picker').hidden = false;
    renderHome();
}

function firstOwnSquare() {
    const pieces = sess.pieces();
    const sqs = Object.keys(pieces).filter((s) => pieces[s].color === sess.state.player);
    const allow = new Set((sess.state.level.movePieces || []).map((s) => s.toLowerCase()));
    return sqs.find((s) => !allow.size || allow.has(pieces[s].type)) || sqs[0] || 'e2';
}

function say(msg) {
    const el = $('fb-text');
    if (el) el.textContent = msg;
}
/** Coloured status line under the board (mirrors .feedback in Lessons). */
function feedback(kind, msg) {
    const el = $('lv-feedback');
    if (!el) return;
    el.className = 'feedback ' + kind;
    el.textContent = msg;
}

/* Achievement strip above the board. Before solving it shows the stars
   already banked for this level (your "how brave" record); after solving it
   shows the stars just earned plus the score line and the coach's praise. */
function showAchievement(stars, score, praise, scored) {
    const bar = $('lv-achieve');
    const starWrap = $('lv-achieve-stars');
    const text = $('lv-achieve-text');
    if (!bar || !starWrap || !text) return;
    starWrap.innerHTML = starRow(stars);
    [...starWrap.children].forEach((c, i) => {
        if (c.classList.contains('on')) c.style.animationDelay = `${i * 120}ms`;
    });
    text.textContent = '';
    if (score) {
        // Highlight just the points, the way a score should read.
        const m = score.match(/\d+ pts/);
        if (m) {
            text.appendChild(document.createTextNode(score.slice(0, m.index)));
            const pts = document.createElement('span');
            pts.className = 'pts';
            pts.textContent = m[0];
            text.appendChild(pts);
            text.appendChild(document.createTextNode(score.slice(m.index + m[0].length)));
        } else {
            text.textContent = score;
        }
    }
    if (praise) {
        const em = document.createElement('em');
        em.textContent = ` — ${praise}`;
        text.appendChild(em);
    }
    bar.classList.toggle('scored', !!scored);
}

/* ── sound: reuse the site's SoundEngine (same clip + mute key cc_mute) ── */
function sound() { return (typeof window !== 'undefined' && window.app && window.app.snd) ? window.app.snd : null; }

function playLevelSound(captured, success) {
    const s = sound();
    if (s) {
        if (success && typeof s.playSuccess === 'function') s.playSuccess();
        else if (captured && typeof s.playCapture === 'function') s.playCapture();
        else if (typeof s.playMove === 'function') s.playMove();
        return;
    }
    // Fallback for pages without app.js: play the clip ourselves, honoring mute.
    try {
        if (localStorage.getItem('cc_mute') === '1') return;
        const a = new Audio('assets/sounds/move.mp3?v=1');
        a.play().catch(() => {});
    } catch (_) { /* audio unavailable */ }
}

/* ── next-level navigation (action row button + result button + N key) ── */
function currentIndex() {
    if (!DATA || !sess) return -1;
    return DATA.levels.findIndex((l) => l.id === sess.state.level.id);
}

function nextLevel() {
    const i = currentIndex();
    if (i >= 0 && i + 1 < DATA.levels.length) openLevel(DATA.levels[i + 1].id);
}

function updateNextBtn() {
    const btn = $('next-lvl-btn');
    if (!btn) return;
    const i = currentIndex();
    const last = i < 0 || i + 1 >= DATA.levels.length;
    btn.disabled = last;
    const nxt = last ? null : DATA.levels[i + 1];
    btn.textContent = last ? 'All levels cleared' : 'Next stage →';
    btn.title = nxt ? `${T(nxt.title)} (N)` : '';
    // Mirror the state onto the sticky bar button (phones) and label it.
    const sbtn = $('lv-sticky-next');
    if (sbtn) {
        sbtn.disabled = last;
        sbtn.textContent = last ? 'Cleared' : 'Next →';
        sbtn.title = btn.title;
    }
    // The bar sits above the board, so it must say WHAT the next level is.
    // "Next →" alone gives the player nothing to decide with.
    const label = $('lv-sticky-label');
    if (label && i >= 0) {
        const g = (sess.state.level.group || 'stage');
        label.textContent = nxt ? `Next · ${T(nxt.title)}` : `Level ${i + 1} · ${g}`;
        label.title = nxt ? `${T(nxt.title)} (N)` : '';
    }
}

function collectRemaining() {
    const g = (sess.state.level.goal && sess.state.level.goal.collect) || [];
    return g.filter((s) => !sess.state.collected.has(s));
}
function captureRemaining() {
    const g = (sess.state.level.goal && sess.state.level.goal.capture) || [];
    return g.filter((s) => !sess.state.captured.has(s));
}

/** Light up the goal pips + progress counters from live session state.
    The goal card counts GOALS collected; the player card counts MOVES against
    par. Keeping the two numbers on their own card avoids reading the same
    "0 / 3" twice on one screen. */
function syncGoalUI() {
    const s = sess.state;
    const track = $('lv-goal-track');
    let doneCount = 0;
    if (track) {
        track.querySelectorAll('.pip').forEach((p) => {
            const sq = p.dataset.sq;
            const done = p.classList.contains('target')
                ? s.captured.has(sq) || (s.level.goal && s.level.goal.reach && s.level.goal.reach.square === sq)
                : s.collected.has(sq);
            p.classList.toggle('done', !!done);
            if (done) doneCount++;
        });
    }
    const total = track ? track.children.length : 0;
    const prog = $('lv-opp-turn');
    if (prog) prog.textContent = `${doneCount} / ${total}`;
    $('lv-you-sub').textContent = `${s.player === 'b' ? 'Black' : 'White'} · move ${s.moves}`;
    $('mv').textContent = s.moves;
    // Mirror the counter into the sticky bar so phones always show it.
    $('lv-sticky-mv').textContent = s.moves;
    $('lv-sticky-par').textContent = s.level.par;
}

/* Move log. Append-only on a normal move (one row per move); a full rebuild
   happens only when the list shrinks (undo / restart), because re-serialising
   every row on each move showed up as the single most expensive thing in the
   click handler under CPU throttling. */
let logMoves = [];
const EMPTY_LOG = '<span style="color:var(--text-muted-dim)">No moves yet — select a white piece to begin.</span>';

/* Keep the newest row visible WITHOUT forcing a synchronous layout. Reading
   scrollHeight and writing scrollTop both flush layout, which — inside a click
   handler — was the single most expensive thing left in the move path. Do it
   after paint instead, and only when the list actually overflows. */
function autoscrollLog() {
    const el = $('lv-log');
    if (!el) return;
    const run = () => {
        if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
}

function renderLog() {
    const el = $('lv-log');
    if (!el) return;
    if (!logMoves.length) {
        if (el.innerHTML !== EMPTY_LOG) el.innerHTML = EMPTY_LOG;
        return;
    }
    el.innerHTML = '';
    const frag = document.createDocumentFragment();
    logMoves.forEach((label, i) => frag.appendChild(logRow(label, i + 1)));
    el.appendChild(frag);
    autoscrollLog();
}

/** One "n. e2-e4" row. Built with createElement + textContent rather than
    innerHTML: parsing a markup string was the most expensive thing left in
    the click handler under CPU throttling. */
function logRow(label, n) {
    const row = document.createElement('div');
    row.className = 'move-pair';
    const num = document.createElement('span');
    num.className = 'move-num';
    num.textContent = `${n}.`;
    const mv = document.createElement('span');
    mv.className = 'move-item';
    mv.textContent = label;
    row.appendChild(num);
    row.appendChild(mv);
    return row;
}

/** Append a single row without touching the rest of the list. */
function appendLogRow(label, n) {
    const el = $('lv-log');
    if (!el) return;
    if (!logMoves.length) el.innerHTML = '';
    el.appendChild(logRow(label, n));
    autoscrollLog();
}

function pushLog(from, to, res, reply) {
    const cap = res && res.captured ? 'x' : '-';
    const suf = res && res.promotion ? '=' + String(res.promotion).toUpperCase() : '';
    let label = `${from}${cap}${to}${suf}`;
    // Opponent levels: the enemy's answer rides on the same row, so undo
    // (one row = one engine snapshot) stays one click.
    if (reply) {
        const rcap = reply.captured ? 'x' : '-';
        label += ` ${reply.from}${rcap}${reply.to}`;
    }
    logMoves.push(label);
    appendLogRow(label, logMoves.length);
}

/* ── Captured-material tray (same visual language as the Lessons screen) ─
   Built ONCE per level: each goal capture square shows the piece that stood
   there (real artwork, not a placeholder pawn) plus its square name, and the
   item gets a "taken" treatment the moment it is captured. Nothing is
   re-serialised per move. */
const PIECE_FILE = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn', k: 'king' };

function buildCapturedTray() {
    const el = $('lv-caps');
    if (!el) return;
    const targets = ((sess.state.level.goal && sess.state.level.goal.capture) || []);
    el.innerHTML = '';
    if (!targets.length) return;
    const pieces = sess.pieces();
    const frag = document.createDocumentFragment();
    for (const sq of targets) {
        const p = pieces[sq];
        const item = document.createElement('span');
        item.className = 'cap-item';
        item.dataset.capSq = sq;
        if (p && PIECE_FILE[p.type]) {
            const img = document.createElement('img');
            const pc = p.color === 'w' ? p.type.toUpperCase() : p.type;
            img.src = (window.DoChessPieces && window.DoChessPieces.url(pc, 'v24')) ||
                `assets/pieces/${p.color === 'w' ? 'white' : 'black'}-${PIECE_FILE[p.type]}.svg?v24`;
            img.dataset.fallbackPiece = pc;
            img.width = 20; img.height = 20;
            img.alt = `${p.color === 'w' ? 'White' : 'Black'} ${p.type} on ${sq}`;
            item.appendChild(img);
        } else {
            const dot = document.createElement('span');
            dot.className = 'cap-unknown';
            dot.title = `Piece captured on ${sq}`;
            item.appendChild(dot);
        }
        const tag = document.createElement('em');
        tag.textContent = sq;
        item.appendChild(tag);
        frag.appendChild(item);
    }
    el.appendChild(frag);
}

function syncCapturedTray() {
    const el = $('lv-caps');
    if (!el || !el.children.length) return;
    const captured = sess.state.captured;
    el.querySelectorAll('.cap-item').forEach((item) => {
        const sq = item.dataset.capSq;
        item.classList.toggle('taken', captured.has(sq) || !sess.pieces()[sq]);
    });
}

function paint() {
    if (!sess || !board) return;
    const s = sess.state;
    const pieces = sess.pieces();
    const sel = s.selected;
    const legal = sel ? sess.legalFor(sel) : [];
    board.render({
        pieces,
        selected: sel,
        legalTos: new Set(legal.map((m) => m.to)),
        captureTos: new Set(legal.filter((m) => m.captured).map((m) => m.to)),
        lastFrom: s.lastMove ? s.lastMove.from : null,
        lastTo: s.lastMove ? s.lastMove.to : null,
        checkSq: sess.inCheck() ? sess.kingSquare() : null,
        stars: new Set(collectRemaining()),
        targets: new Set(captureRemaining()),
        obstacles: new Set(s.level.obstacles || []),
        reachSq: (s.level.goal && s.level.goal.reach && s.level.goal.reach.square) || null,
        rover: sel || s.rover || firstOwnSquare(),
    });
    syncGoalUI();
    syncCapturedTray();
}

function onSquare(sq) {
    if (!sess || sess.state.done) return;
    const s = sess.state;
    // Promotion picker is modal, but never a dead end: tapping anywhere
    // else (or Esc) cancels it instead of swallowing every future click.
    // Cancelling drops the stale selection too, so engine state and the
    // board always agree — otherwise the old piece stays "selected" with no
    // legal dots drawn and the next click lands on a half-finished selection.
    if (pendingPromo) {
        if (sq === pendingPromo.to) return; // stay pending; picker is open
        pendingPromo = null;
        $('promo-row').hidden = true;
        s.selected = null;
        say('');
        feedback('info', 'Promotion cancelled — pick your piece again.');
        paint();
        if (sess.pieces()[sq]) return onSquare(sq); // the tap that cancelled can also select
        return;
    }
    if (!s.selected) {
        const p = sess.pieces()[sq];
        if (!p) return;
        s.selected = sq;
        s.rover = sq;
        if (!sess.legalFor(sq).length) {
            const msg = T(s.level.failHint) || 'That piece has no moves here.';
            say(msg);
            feedback('error', msg);
            s.selected = null;
            paint();
            return;
        }
        paint();
        return;
    }
    if (sq === s.selected) { s.selected = null; paint(); return; }
    if (!sess.legalFor(s.selected).some((m) => m.to === sq)) {
        const p = sess.pieces()[sq];
        const allow = new Set((s.level.movePieces || []).map((x) => x.toLowerCase()));
        if (p && (!allow.size || allow.has(p.type))) { s.selected = sq; s.rover = sq; paint(); return; }
        const msg = T(s.level.failHint) || 'Not a legal move for that piece.';
        say(msg);
        feedback('error', msg);
        s.selected = null;
        paint();
        return;
    }
    const from = s.selected;
    if (sess.needsPromotion(from, sq)) {
        pendingPromo = { from, to: sq };
        $('promo-row').hidden = false;
        say('Choose your promotion piece.');
        feedback('info', 'Choose your promotion piece — or tap the square again to cancel.');
        return;
    }
    doMove(from, sq, null);
}

function doMove(from, to, promo) {
    const before = sess.state;
    const starsBefore = collectRemaining().length + captureRemaining().length;
    const r = sess.play(from, to, promo);
    pendingPromo = null;
    $('promo-row').hidden = true;
    if (!r.ok) {
        const msg = r.reason === 'illegal' ? (T(sess.state.level.failHint) || 'Not a legal move.') : 'Hmm.';
        say(msg);
        feedback('error', msg);
        return;
    }
    pushLog(from, to, r.move, r.reply);
    sess.state.lastMove = { from, to };
    sess.state.rover = to;
    const captured = !!(r.move && r.move.captured);
    paint();
    // The defender's capture lands after the player's: burst it too.
    if (r.reply && r.reply.captured) board.burst(r.reply.to, 'target');

    // Goal feedback: celebrate whatever the move just scored.
    const starsAfter = collectRemaining().length + captureRemaining().length;
    if (starsAfter < starsBefore) {
        board.burst(to, collectedNow(to) ? 'star' : 'target');
    } else if (captured) {
        board.burst(to, 'target');
    }

    if (r.done) {
        showResult(r.result);
        playLevelSound(captured, true);
        say(T(sess.state.level.success));
        feedback('success', `${sess.state.moves} move(s) — solved!`);
    } else {
        // Speech bubble stays as the coach's voice; only the status strip moves.
        if (starsAfter < starsBefore) say(T(sess.state.level.success) || 'Nicely done.');
        board.focusSquare(to);
        playLevelSound(captured, false);
        if (sess.inCheck()) {
            feedback('error', 'Check! Your king is attacked — get it to safety.');
        } else if (starsAfter === 0) {
            feedback('info', 'Goal reached — one more move to finish.');
        } else {
            feedback('info', 'Keep going — follow the stars.');
        }
    }
}
function collectedNow(sq) { return sess.state.collected.has(sq); }

function showResult(res) {
    const s = sess.state;
    const id = s.level.id;
    const gained = res.stars > (store.state.stars[id] || 0);
    const firstSolve = !store.state.attempts[id]?.solvedAt;
    if (gained) {
        store.state.stars[id] = res.stars;
    }
    // Attempts + XP are additive and truthful: tries counted per entry in
    // openLevel, hints/solve recorded here, XP only on the first solve.
    try {
        const a = store.state.attempts[id] || (store.state.attempts[id] = { tries: 0, hintsUsed: 0, solvedAt: null });
        a.hintsUsed = Math.max(a.hintsUsed || 0, res.hintsUsed || 0);
        if (firstSolve) {
            a.solvedAt = new Date().toISOString();
            if (s.level.xp) addXp(store.state, s.level.xp);
            try { touchDay(store.state); } catch (_) {}
        }
        saveProgress(store.state, store.backend);
    } catch (_) { try { saveProgress(store.state, store.backend); } catch (_) {} }
    const starsEl = $('r-stars');
    starsEl.innerHTML = starRow(res.stars);
    // Staggered pop so the stars land one after another (0/120/240ms).
    [...starsEl.children].forEach((c, i) => {
        if (c.classList.contains('on')) c.style.animationDelay = `${i * 120}ms`;
    });
    const scoreLine = `${res.moves} moves · par ${res.par} · ${res.points} pts` +
        (res.hintsUsed ? ` · ${res.hintsUsed} hint(s)` : '');
    const praise = T(s.level.success);
    $('r-text').textContent = `${scoreLine} — ${praise}`;
    // Same result above the board: on a phone the result card sits far below
    // the fold, so the stars + score must also live directly above the board.
    showAchievement(res.stars, scoreLine, praise, true);
    $('result').hidden = false;
    $('result').classList.add('show');
    // Navigation is bound once in bootLearn; only the enabled state is per-level.
    const idx = DATA.levels.findIndex((l) => l.id === id);
    const btn = $('next-btn');
    if (btn) btn.disabled = idx < 0 || idx + 1 >= DATA.levels.length;
    if (gained) popStars(document.querySelector(`[data-lv="${id}"]`));
}

function bind(id, fn) {
    const el = $(id);
    if (el && !el.dataset.learnBound) { el.dataset.learnBound = '1'; el.addEventListener('click', fn); }
}

/** Level restart: clears every piece of transient level state, incl. the
    promotion picker — a stuck picker used to freeze the board for good. */
function restartLevel(msg) {
    if (!sess) return;
    sess.restart();
    pendingPromo = null;
    $('promo-row').hidden = true;
    $('result').hidden = true;
    $('result').classList.remove('show');
    $('solve-text').textContent = '';
    logMoves = [];
    renderLog();
    say(msg || 'Fresh board — go!');
    feedback('info', msg || 'Fresh board — go!');
    paint();
    board.focusSquare(firstOwnSquare());
}

async function bootLearn() {
    bootFocusMode();
    // Every Learn entry (header, side rail, tab bar) opens the picker.
    // A leftover ?level= must not trap the player on one puzzle when they
    // tap Learn again from another screen.
    document.querySelectorAll('#nav-learn, [data-nav="learn"]').forEach((el) => {
        if (el.dataset.learnBound) return;
        el.dataset.learnBound = '1';
        el.addEventListener('click', showPickerHome);
    });
    bind('start-levels-btn', () => showPickerHome());
    bind('back-btn', showPickerHome);
    bind('next-lvl-btn', nextLevel);
    bind('next-btn', nextLevel);
    // Sticky-bar twins: same handlers, always reachable on a phone.
    bind('lv-sticky-next', nextLevel);
    bind('lv-sticky-undo', () => $('undo-btn').click());
    bind('lv-sticky-restart', () => $('restart-btn').click());
    bind('lv-sticky-back', () => $('back-btn').click());
    bind('lv-sticky-hint', () => $('hint-btn').click());
    bind('lv-sticky-solve', () => $('solve-btn').click());
    bind('retry-btn', () => restartLevel('Fresh board — go!'));
    bind('undo-btn', () => {
        if (!sess) return;
        // Undoing out of a pending promotion must drop the picker too.
        pendingPromo = null;
        $('promo-row').hidden = true;
        if (sess.undo()) {
            logMoves.pop();
            renderLog();
            say('Undone.');
            feedback('info', 'Undone.');
            paint();
        }
    });
    bind('restart-btn', () => restartLevel('Fresh board — go!'));
    bind('hint-btn', () => {
        if (!sess) return;
        const h = sess.hint();
        const msg = h || 'No more hints — the Solution button shows the shortest road.';
        $('hint-text').textContent = msg;
        feedback('info', msg);
    });
    bind('solve-btn', () => {
        if (!sess) return;
        const r = sess.solution();
        const msg = r.reachable
            ? `Shortest (${r.par}): ${r.lines[0].join(' ')}${r.lines[1] ? '  |  ' + r.lines[1].join(' ') : ''}`
            : 'No solution found?! ' + (r.failReason || '');
        $('solve-text').textContent = msg;
        feedback('info', msg);
    });
    const promoRow = $('promo-row');
    if (promoRow && !promoRow.dataset.learnBound) {
        promoRow.dataset.learnBound = '1';
        promoRow.addEventListener('click', (e) => {
            const b = e.target.closest('[data-promo]');
            if (!b || !pendingPromo) return;
            const { from, to } = pendingPromo;
            doMove(from, to, b.dataset.promo);
        });
    }
    document.addEventListener('keydown', (e) => {
        if (!sess || !inLearn() || $('levelview').hidden) return;
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        const k = e.key.toLowerCase();
        if (k === 'escape' && pendingPromo) {
            pendingPromo = null;
            $('promo-row').hidden = true;
            sess.state.selected = null;
            say('');
            feedback('info', 'Promotion cancelled — pick your piece again.');
            paint();
            return;
        }
        if (k === 'u') { if (sess.undo()) { pendingPromo = null; $('promo-row').hidden = true; logMoves.pop(); renderLog(); say('Undone.'); paint(); } }
        else if (k === 'r') { restartLevel('Fresh board — go!'); }
        else if (k === 'h') { $('hint-btn').click(); }
        else if (k === 'n') { nextLevel(); }
    });
    // Legacy nav clicks hide Learn (app.js handlers still run untouched).
    // The More sheet is not navigation — opening it must not hide Learn.
    document.querySelectorAll('.nav-btn').forEach((b) => {
        const nv = b.dataset.nav || '';
        if (nv === 'learn' || nv === 'more' || b.id === 'nav-learn') return;
        b.addEventListener('click', () => hideLearn());
    });
    // Piece style switched in the Online lobby: the board pieces are swapped
    // in place by js/pieces.js, but the icon/tray artwork needs a re-render.
    window.addEventListener('dochess:pieces', () => {
        if (!inLearn()) return;
        if (view === 'home') renderHome();
        else if (view === 'set' && currentSetId) renderSetView(currentSetId);
        else if (sess) { buildCapturedTray(); syncCapturedTray(); }
    });
    // Cloud sync pulled newer learn progress for this account: reload the
    // module store so stars/XP on screen match the server, not the device.
    window.addEventListener('dochess:synced', (e) => {
        const w = (e && e.detail && e.detail.written) || {};
        if (!w.learn) return;
        store = loadProgress();
        if (!inLearn()) return;
        if (view === 'home') renderHome();
        else if (view === 'set' && currentSetId) renderSetView(currentSetId);
    });

    try {
        // Bundle first: js/learn.bundle.js inlines the curriculum, so levels
        // load from file:// and behind the meta-CSP with no fetch at all.
        if (globalThis.__DOCHESS_LESSONS__) {
            DATA = globalThis.__DOCHESS_LESSONS__;
        } else {
            const res = await fetch('data/lessons.json');
            if (!res.ok) throw new Error('http ' + res.status);
            DATA = await res.json();
        }
        if (!DATA || !Array.isArray(DATA.levels) || !DATA.levels.length) {
            throw new Error('curriculum has no levels[]');
        }
    } catch (e) {
        const pk = $('picker');
        if (pk) {
            pk.innerHTML = `<div class="panel"><h2>Couldn't load levels</h2>` +
                `<p>${String((e && e.message) || e)}</p>` +
                `<p>Rebuild the bundle: <code>node tools/build-learn.mjs</code></p></div>`;
        }
        console.error('[DoChess] levels failed to load:', e);
        return;
    }
    const params = new URLSearchParams(location.search);
    const id = params.get('level');
    const set = params.get('set');
    if (id && DATA.levels.some((l) => l.id === id && !l.planned)) { logMoves = []; renderLog(); openLevel(id); }
    else if (set && setById(set)) { openSet(set); }
    // play.html redirects here as index.html?level=x#learn — honor the marker
    // so the redirect actually lands on the picker instead of Home.
    else if (location.hash === '#learn') showPickerHome();
}
__exports.bootLearn = bootLearn;
__exports.showLearn = showLearn;
return __exports;
});

/* ── boot ──────────────────────────────────────────────────────────── */
const __learn = __req('learn');
global.DoChessLearn = {
    bootLearn: __learn.bootLearn,
    showLearn: __learn.showLearn,
    curriculum: global.__DOCHESS_LESSONS__,
    // Public surface for the browser console / harnesses (tests-batch1.html):
    // console.runAllTests(DoChessLearn.curriculum, ChessJsAdapter(Chess))
    storage: __req('storage'),
    lessons: __req('lessons'),
    engine: __req('engine'),
    board: __req('board'),
    // Focus mode is shared by Learn and Lessons; app.js boots it too.
    focus: __req('focus'),
};
function __boot() {
    const p = __learn.bootLearn();
    if (p && typeof p.catch === 'function') {
        p.catch(function (e) { console.error('[DoChess] Learn failed to boot:', e); });
    }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', __boot, { once: true });
} else {
    __boot();
}
})(typeof window !== 'undefined' ? window : this);
