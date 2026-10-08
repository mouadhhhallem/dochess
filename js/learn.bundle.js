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
global.__DOCHESS_LESSONS__ = {"version":1,"stages":[{"n":1,"title":{"en":"The board and the pieces","fr":"L'échiquier et les pièces","ar":"الرقعة والقطع"},"desc":{"en":"How each piece moves. Land on stars, capture targets — fewer moves, more points.","fr":"Comment chaque pièce se déplace. Atteignez les étoiles, capturez les cibles — moins de coups, plus de points.","ar":"كيف تتحرك كل قطعة. اجمع النجوم والتقط القطع — كلما قلّت النقلات زادت النقاط."}}],"levels":[{"id":"s1r-1","stage":1,"group":"rook","themes":["rook","movement"],"mode":"free-move","type":"free-move","title":{"en":"Rook: straight lines","fr":"Tour : lignes droites","ar":"الرخ: خطوط مستقيمة"},"intro":{"en":"The rook moves in straight lines. Land on every star — the fewer moves you make, the more points you win!","fr":"La tour se déplace en ligne droite. Atteignez chaque étoile — moins de coups, plus de points !","ar":"يتحرك الرخ في خطوط مستقيمة. قف على كل نجمة — كلما قلّت نقلاتك زادت نقاطك!"},"goalText":{"en":"Collect all 3 stars with the rook.","fr":"Ramassez les 3 étoiles avec la tour.","ar":"اجمع النجوم الثلاث بالرخ."},"fen":"4k3/8/8/8/8/8/8/R3K3 w - - 0 1","movePieces":["r"],"goal":{"collect":["a4","a6","a8"]},"par":3,"maxMoves":8,"hints":[{"en":"Rooks travel any number of empty squares, straight only.","fr":"La tour parcourt autant de cases vides qu'elle veut, en ligne droite.","ar":"يقطع الرخ أي عدد من المربعات الفارغة في خط مستقيم."},{"en":"The whole a-file is empty — climb it star by star.","fr":"Toute la colonne a est vide — montez étoile par étoile.","ar":"العمود a فارغ تمامًا — اصعده نجمةً نجمة."},{"en":"Play a4, then a6, then a8.","fr":"Jouez a4, puis a6, puis a8.","ar":"العب a4 ثم a6 ثم a8."}],"explain":{"en":"One star per landing: passing over a star does not collect it.","fr":"Une étoile par arrivée : passer au-dessus ne suffit pas.","ar":"نجمة واحدة عند الوقوف: المرور فوق النجمة لا يجمعها."},"success":{"en":"3 stars in 3 moves — perfect rook control!","fr":"3 étoiles en 3 coups — contrôle parfait !","ar":"٣ نجوم في ٣ نقلات — سيطرة مثالية!"},"failHint":{"en":"Count your landings: each star needs its own stop.","fr":"Comptez vos arrivées : chaque étoile demande son arrêt.","ar":"احسب وقفاتك: كل نجمة تحتاج توقفًا."},"xp":10},{"id":"s1r-2","stage":1,"group":"rook","themes":["rook","movement"],"mode":"free-move","type":"free-move","title":{"en":"Rook: change direction","fr":"Tour : changer de direction","ar":"الرخ: تغيير الاتجاه"},"goalText":{"en":"Collect all 3 stars. Your own king blocks the first rank!","fr":"Ramassez les 3 étoiles. Votre propre roi bloque la première rangée !","ar":"اجمع النجوم الثلاث. ملكك يعترض الصف الأول!"},"fen":"8/8/6k1/8/8/8/8/R3K3 w - - 0 1","movePieces":["r"],"goal":{"collect":["a8","h8","h1"]},"par":3,"maxMoves":8,"hints":[{"en":"Your king on e1 blocks sliding along rank 1.","fr":"Votre roi en e1 bloque le passage sur la rangée 1.","ar":"ملكك في e1 يسد الطريق على الصف الأول."},{"en":"Go up the a-file first, then turn.","fr":"Montez d'abord la colonne a, puis tournez.","ar":"اصعد العمود a أولًا ثم انعطف."},{"en":"Play a8, h8, h1.","fr":"Jouez a8, h8, h1.","ar":"العب a8 ثم h8 ثم h1."}],"explain":{"en":"Rooks turn corners by combining two straight slides. Friendly pieces block too.","fr":"La tour tourne en combinant deux glissades droites. Les pièces amies bloquent aussi.","ar":"ينعطف الرخ بجمع حركتين مستقيمتين. القطع الصديقة تعترض أيضًا."},"success":{"en":"Three corners turned — the rook dances!","fr":"Trois virages — la tour danse !","ar":"ثلاثة انعطافات — الرخ يرقص!"},"failHint":{"en":"The e1 king forces the a-file route. Up, across, down.","fr":"Le roi e1 impose la colonne a. Haut, traversée, bas.","ar":"ملك e1 يفرض طريق العمود a. اصعد ثم اعبر ثم انزل."},"xp":10},{"id":"s1r-3","stage":1,"group":"rook","themes":["rook","blocked-path"],"mode":"free-move","type":"free-move","title":{"en":"Rook: blocked path","fr":"Tour : passage bloqué","ar":"الرخ: طريق مسدود"},"goalText":{"en":"Your pawn on a6 blocks the file. Collect both stars anyway.","fr":"Votre pion en a6 bloque la colonne. Ramassez les étoiles quand même.","ar":"بيدقك في a6 يسد العمود. اجمع النجمتين رغم ذلك."},"fen":"8/7k/P7/8/8/8/8/R3K3 w - - 0 1","movePieces":["r"],"goal":{"collect":["a4","a8"]},"par":4,"maxMoves":10,"hints":[{"en":"The a6 pawn splits the file in two — detour around it.","fr":"Le pion a6 coupe la colonne en deux — contournez-le.","ar":"البيدق a6 يقسم العمود — التفّ حوله."},{"en":"Collect a4 first, then leave the file sideways.","fr":"Prenez a4 d'abord, puis quittez la colonne.","ar":"اجمع a4 أولًا ثم اخرج من العمود جانبًا."},{"en":"Play a4, e4, e8, a8.","fr":"Jouez a4, e4, e8, a8.","ar":"العب a4 ثم e4 ثم e8 ثم a8."}],"explain":{"en":"When the direct road is blocked, a rook goes around the obstacle in a rectangle.","fr":"Quand la route directe est bloquée, la tour contourne l'obstacle en rectangle.","ar":"عندما يُسد الطريق المباشر يلتف الرخ حول العائق مستطيلًا."},"success":{"en":"Detour mastered — blockers are just puzzles!","fr":"Détour maîtrisé — les bloqueurs ne sont que des énigmes !","ar":"أتقنت الالتفاف — العوائق مجرد ألغاز!"},"failHint":{"en":"a6 can't be crossed. Rectangle: out, up, back.","fr":"a6 est infranchissable. Rectangle : sortie, montée, retour.","ar":"لا يمكن عبور a6. مستطيل: اخرج ثم اصعد ثم عُد."},"xp":15},{"id":"s1r-4","stage":1,"group":"rook","themes":["rook","capture"],"mode":"free-move","type":"free-move","title":{"en":"Rook: capture the pawns","fr":"Tour : capturez les pions","ar":"الرخ: التقط البيادق"},"goalText":{"en":"Capture all 3 black pawns.","fr":"Capturez les 3 pions noirs.","ar":"التقط البيادق السوداء الثلاثة."},"fen":"1k2p3/8/8/p3p3/8/8/8/R3K3 w - - 0 1","movePieces":["r"],"goal":{"capture":["a5","e5","e8"]},"par":3,"maxMoves":8,"hints":[{"en":"Rooks capture exactly like they move: land on the enemy.","fr":"La tour capture comme elle se déplace : en arrivant sur l'ennemi.","ar":"يلتقط الرخ كما يتحرك: بالوقوف على العدو."},{"en":"Start with the closest pawn, a5.","fr":"Commencez par le pion le plus proche, a5.","ar":"ابدأ بالبيدق الأقرب a5."},{"en":"Play axa5, a5–e5, exxe8.","fr":"Jouez axa5, a5–e5, exxe8.","ar":"العب axa5 ثم a5–e5 ثم exxe8."}],"explain":{"en":"Chain captures along shared lines: each capture lands you lined up for the next.","fr":"Enchaînez les captures sur des lignes partagées : chaque prise vous aligne pour la suivante.","ar":"سلسِل الالتقاط على خطوط مشتركة: كل التقاط يضعك على خط التالي."},"success":{"en":"Three pawns swept off the board!","fr":"Trois pions balayés de l'échiquier !","ar":"ثلاثة بيادق كُنسَت عن الرقعة!"},"failHint":{"en":"Follow the chain a5 → e5 → e8.","fr":"Suivez la chaîne a5 → e5 → e8.","ar":"اتبع السلسلة a5 ← e5 ← e8."},"xp":15},{"id":"s1r-5","stage":1,"group":"rook","themes":["rook","obstacles"],"mode":"free-move","type":"free-move","title":{"en":"Rook: forbidden squares","fr":"Tour : cases interdites","ar":"الرخ: مربعات ممنوعة"},"goalText":{"en":"Reach h8. The marked squares are lava — never cross or land on them.","fr":"Atteignez h8. Les cases marquées sont de la lave — ne les traversez ni n'y arrêtez.","ar":"اصِل إلى h8. المربعات المعلّمة حمم — لا تعبرها ولا تقف عليها."},"fen":"8/8/8/1k6/8/8/8/R3K3 w - - 0 1","movePieces":["r"],"goal":{"collect":["d8","h8"]},"obstacles":["a8","h1"],"par":3,"maxMoves":8,"hints":[{"en":"a8 and h1 are lava. Both 2-move roads use them.","fr":"a8 et h1 sont de la lave. Les deux routes en 2 coups les utilisent.","ar":"a8 وh1 حمم. الطريقان ذات النقلتين يمران بهما."},{"en":"Climb the d-file instead.","fr":"Montez plutôt par la colonne d.","ar":"اصعد من العمود d بدلًا من ذلك."},{"en":"Play d1, d8, h8.","fr":"Jouez d1, d8, h8.","ar":"العب d1 ثم d8 ثم h8."}],"explain":{"en":"Obstacles turn roads off: always re-check which 2-move tries survive.","fr":"Les obstacles ferment des routes : revérifiez quelles tentatives en 2 coups survivent.","ar":"العوائق تغلق الطرق: أعد فحص محاولات النقلتين الناجية."},"success":{"en":"Lava dodged — route planning unlocked!","fr":"Lave évitée — planification débloquée !","ar":"نجوت من الحمم — فتحت تخطيط الطرق!"},"failHint":{"en":"a8 and h1 burn. The d-file road is safe.","fr":"a8 et h1 brûlent. La route de la colonne d est sûre.","ar":"a8 وh1 تحرقان. طريق العمود d آمن."},"xp":15},{"id":"s1r-6","stage":1,"group":"rook","themes":["rook","route"],"mode":"free-move","type":"free-move","title":{"en":"Rook: the grand tour","fr":"Tour : le grand tour","ar":"الرخ: الجولة الكبرى"},"goalText":{"en":"Collect all 4 stars. Plan the whole tour before moving!","fr":"Ramassez les 4 étoiles. Planifiez tout le parcours avant de jouer !","ar":"اجمع النجوم الأربع. خطط الجولة كاملة قبل الحركة!"},"fen":"8/8/8/8/K2k4/8/8/R7 w - - 0 1","movePieces":["r"],"goal":{"collect":["h2","b2","b7","h7"]},"par":5,"maxMoves":12,"hints":[{"en":"Four stars, so at least 4 landings — plus getting started.","fr":"Quatre étoiles, donc au moins 4 arrivées — plus le départ.","ar":"أربع نجوم أي أربع وقفات على الأقل — زائد البداية."},{"en":"Sweep the bottom rank, then climb the b-file.","fr":"Balayez la rangée du bas, puis montez la colonne b.","ar":"امسح الصف السفلي ثم اصعد العمود b."},{"en":"One road: h1, h2, b2, b7, h7.","fr":"Une route : h1, h2, b2, b7, h7.","ar":"طريق واحد: h1 ثم h2 ثم b2 ثم b7 ثم h7."}],"explain":{"en":"Shortest routes chain shared lines: each landing sets up the next.","fr":"Les routes les plus courtes enchaînent des lignes partagées : chaque arrivée prépare la suivante.","ar":"أقصر الطرق تسلسل خطوطًا مشتركة: كل وقفة تجهّز التالية."},"success":{"en":"Grand tour in 5 — true rook vision!","fr":"Grand tour en 5 — vraie vision de tour !","ar":"جولة كبرى في ٥ — نظرة رخ حقيقية!"},"failHint":{"en":"Order matters: h2–b2 share a rank, b2–b7 a file, b7–h7 a rank.","fr":"L'ordre compte : h2–b2 partagent une rangée, b2–b7 une colonne, b7–h7 une rangée.","ar":"الترتيب مهم: h2–b2 في صف واحد وb2–b7 في عمود وb7–h7 في صف."},"xp":20},{"id":"s1b-1","stage":1,"group":"bishop","themes":["bishop","movement"],"mode":"free-move","type":"free-move","title":{"en":"Bishop: stay on color","fr":"Fou : restez sur la couleur","ar":"الفيل: ابقَ على اللون"},"intro":{"en":"The bishop glides diagonally and never leaves its color. Land on every star — fewer moves, more points!","fr":"Le fou glisse en diagonale et ne quitte jamais sa couleur. Atteignez chaque étoile — moins de coups, plus de points !","ar":"ينزلق الفيل قطريًا ولا يغادر لونه أبدًا. قف على كل نجمة — كلما قلّت نقلاتك زادت نقاطك!"},"goalText":{"en":"Collect both stars with the bishop.","fr":"Ramassez les 2 étoiles avec le fou.","ar":"اجمع النجمتين بالفيل."},"fen":"k7/8/8/8/8/8/8/2B3K1 w - - 0 1","movePieces":["b"],"goal":{"collect":["e3","g5"]},"par":2,"maxMoves":8,"hints":[{"en":"Bishops own diagonals — c1, d2, e3, f4, g5, h6 is one line.","fr":"Les fous règnent sur les diagonales — c1, d2, e3, f4, g5, h6 forment une ligne.","ar":"الفيلة تملك الأقطار — c1 وd2 وe3 وf4 وg5 وh6 خط واحد."},{"en":"Both stars sit on that diagonal.","fr":"Les deux étoiles sont sur cette diagonale.","ar":"النجمتان على هذا القطر."},{"en":"Play e3, then g5 — or g5, then e3.","fr":"Jouez e3, puis g5 — ou g5, puis e3.","ar":"العب e3 ثم g5 — أو g5 ثم e3."}],"explain":{"en":"Landing collects the star; gliding over it does not.","fr":"L'arrivée ramasse l'étoile ; la survoler ne suffit pas.","ar":"الوقوف يجمع النجمة؛ المرور فوقها لا يكفي."},"success":{"en":"Diagonal swept clean!","fr":"Diagonale balayée !","ar":"قطر نظيف تمامًا!"},"failHint":{"en":"Stay on the c1–h6 diagonal: e3 and g5.","fr":"Restez sur la diagonale c1–h6 : e3 et g5.","ar":"ابقَ على قطر c1–h6: e3 وg5."},"xp":10},{"id":"s1b-2","stage":1,"group":"bishop","themes":["bishop","movement"],"mode":"free-move","type":"free-move","title":{"en":"Bishop: two diagonals","fr":"Fou : deux diagonales","ar":"الفيل: قطران"},"goalText":{"en":"Collect all 3 stars across both diagonals.","fr":"Ramassez les 3 étoiles sur les deux diagonales.","ar":"اجمع النجوم الثلاثة على القطرين."},"fen":"k7/8/8/8/8/8/8/2B3K1 w - - 0 1","movePieces":["b"],"goal":{"collect":["b2","a3","e7"]},"par":3,"maxMoves":8,"hints":[{"en":"From c1 the bishop reaches two diagonals: b2–a3 and d2–h6.","fr":"Depuis c1 le fou atteint deux diagonales : b2–a3 et d2–h6.","ar":"من c1 يصل الفيل إلى قطرين: b2–a3 وd2–h6."},{"en":"Clear the short diagonal first.","fr":"Nettoyez d'abord la petite diagonale.","ar":"نظّف القطر القصير أولًا."},{"en":"Play b2, a3, then swing up to e7.","fr":"Jouez b2, a3, puis remontez vers e7.","ar":"العب b2 ثم a3 ثم اصعد إلى e7."}],"explain":{"en":"Every bishop move switches diagonals — plan which diagonal each star needs.","fr":"Chaque coup de fou change de diagonale — prévoyez la diagonale de chaque étoile.","ar":"كل نقلة فيل تغيّر القطر — خطط لقطر كل نجمة."},"success":{"en":"Both diagonals harvested!","fr":"Les deux diagonales récoltées !","ar":"حصدت القطرين!"},"failHint":{"en":"b2 and a3 share one diagonal; e7 needs the long a3–f8 road.","fr":"b2 et a3 partagent une diagonale ; e7 exige la longue route a3–f8.","ar":"b2 وa3 على قطر واحد؛ e7 يحتاج طريق a3–f8 الطويل."},"xp":10},{"id":"s1b-3","stage":1,"group":"bishop","themes":["bishop","blocked-path"],"mode":"free-move","type":"free-move","title":{"en":"Bishop: blocked diagonal","fr":"Fou : diagonale bloquée","ar":"الفيل: قطر مسدود"},"goalText":{"en":"Your pawn on d2 blocks the main diagonal. Collect both stars anyway.","fr":"Votre pion en d2 bloque la grande diagonale. Ramassez les étoiles quand même.","ar":"بيدقك في d2 يسد القطر الرئيسي. اجمع النجمتين رغم ذلك."},"fen":"k7/8/8/8/8/8/3P4/2B3K1 w - - 0 1","movePieces":["b"],"goal":{"collect":["f4","h6"]},"par":4,"maxMoves":10,"hints":[{"en":"d2 is occupied, so c1 can't go right — go left first.","fr":"d2 est occupée, c1 ne peut pas aller à droite — allez à gauche d'abord.","ar":"d2 مشغول فلا يستطيع c1 الذهاب يمينًا — اذهب يسارًا أولًا."},{"en":"The a3–f8 diagonal climbs back to the kingside.","fr":"La diagonale a3–f8 remonte vers l'aile roi.","ar":"قطر a3–f8 يصعد عائدًا إلى جناح الملك."},{"en":"Play a3, f8, h6, then drop to f4.","fr":"Jouez a3, f8, h6, puis redescendez en f4.","ar":"العب a3 ثم f8 ثم h6 ثم انزل إلى f4."}],"explain":{"en":"A blocked diagonal means leaving by the other one and returning from above.","fr":"Une diagonale bloquée impose de sortir par l'autre et de revenir par le haut.","ar":"القطر المسدود يعني الخروج من الآخر والعودة من الأعلى."},"success":{"en":"Blockade outflanked — beautiful detour!","fr":"Blocus contourné — beau détour !","ar":"التفت على الحصار — التفاف جميل!"},"failHint":{"en":"Left, up, across, down: a3, f8, h6, f4.","fr":"Gauche, haut, traversée, bas : a3, f8, h6, f4.","ar":"يسار ثم صعود ثم عبور ثم نزول: a3 وf8 وh6 وf4."},"xp":15},{"id":"s1b-4","stage":1,"group":"bishop","themes":["bishop","capture"],"mode":"free-move","type":"free-move","title":{"en":"Bishop: capture the pawns","fr":"Fou : capturez les pions","ar":"الفيل: التقط البيادق"},"goalText":{"en":"Capture all 3 black pawns.","fr":"Capturez les 3 pions noirs.","ar":"التقط البيادق السوداء الثلاثة."},"fen":"k7/8/8/6p1/8/4p3/1p6/2B3K1 w - - 0 1","movePieces":["b"],"goal":{"capture":["b2","e3","g5"]},"par":4,"maxMoves":10,"hints":[{"en":"Captures land you on new diagonals — chain them.","fr":"Les captures vous posent sur de nouvelles diagonales — enchaînez-les.","ar":"الالتقاط يضعك على أقطار جديدة — سلسِلها."},{"en":"The b2 pawn is closest to home.","fr":"Le pion b2 est le plus proche.","ar":"بيدق b2 هو الأقرب."},{"en":"Play xbxb2, back to c1, xxe3, xxg5.","fr":"Jouez xbxb2, retour en c1, xxe3, xxg5.","ar":"العب xbxb2 ثم عُد إلى c1 ثم xxe3 ثم xxg5."}],"explain":{"en":"Each capture is also a redeployment onto the next diagonal.","fr":"Chaque capture est aussi un redéploiement sur la diagonale suivante.","ar":"كل التقاط هو أيضًا إعادة انتشار على القطر التالي."},"success":{"en":"Three pawns picked off the diagonals!","fr":"Trois pions cueillis sur les diagonales !","ar":"ثلاثة بيادق قُطفت من الأقطار!"},"failHint":{"en":"Order: b2 first, swing home, then climb e3–g5.","fr":"Ordre : b2 d'abord, retour, puis montée e3–g5.","ar":"الترتيب: b2 أولًا ثم العودة ثم الصعود e3–g5."},"xp":15},{"id":"s1b-5","stage":1,"group":"bishop","themes":["bishop","obstacles"],"mode":"free-move","type":"free-move","title":{"en":"Bishop: the lava diagonal","fr":"Fou : la diagonale de lave","ar":"الفيل: قطر الحمم"},"goalText":{"en":"g5 is lava — it blocks the direct road to h6. Collect all 3 stars.","fr":"g5 est de la lave — elle bloque la route directe vers h6. Ramassez les 3 étoiles.","ar":"g5 حمم — تسد الطريق المباشر إلى h6. اجمع النجوم الثلاث."},"fen":"k7/8/8/8/8/8/8/2B3K1 w - - 0 1","movePieces":["b"],"goal":{"collect":["b2","a3","h6"]},"obstacles":["g5"],"par":4,"maxMoves":10,"hints":[{"en":"c1–h6 crosses g5, which burns. Go the long way round.","fr":"c1–h6 traverse g5, qui brûle. Faites le grand tour.","ar":"c1–h6 يعبر g5 الحارقة. سِر الطريق الطويل."},{"en":"Grab b2 and a3 on the way out.","fr":"Prenez b2 et a3 en sortant.","ar":"اجمع b2 وa3 في طريقك للخارج."},{"en":"Play b2, a3, f8, h6.","fr":"Jouez b2, a3, f8, h6.","ar":"العب b2 ثم a3 ثم f8 ثم h6."}],"explain":{"en":"One blocked square can force a three-diagonal journey.","fr":"Une seule case bloquée peut imposer un voyage en trois diagonales.","ar":"مربع مسدود واحد قد يفرض رحلة بثلاثة أقطار."},"success":{"en":"Lava crossed safely — detour expert!","fr":"Lave traversée sans dommage — expert du détour !","ar":"عبرت الحمم بسلام — خبير الالتفاف!"},"failHint":{"en":"Never touch g5: b2, a3, f8, h6.","fr":"Ne touchez jamais g5 : b2, a3, f8, h6.","ar":"لا تلمس g5 أبدًا: b2 ثم a3 ثم f8 ثم h6."},"xp":15},{"id":"s1b-6","stage":1,"group":"bishop","themes":["bishop","route"],"mode":"free-move","type":"free-move","title":{"en":"Bishop: the grand diagonal tour","fr":"Fou : le grand tour des diagonales","ar":"الفيل: الجولة القطرية الكبرى"},"goalText":{"en":"Collect all 4 stars. Plan the whole tour first!","fr":"Ramassez les 4 étoiles. Planifiez tout le parcours d'abord !","ar":"اجمع النجوم الأربع. خطط الجولة كاملة أولًا!"},"fen":"k7/8/8/8/8/8/8/2B3K1 w - - 0 1","movePieces":["b"],"goal":{"collect":["f4","h6","a3","e7"]},"par":5,"maxMoves":12,"hints":[{"en":"Four stars on two clusters: the c1 side and the a3 side.","fr":"Quatre étoiles en deux groupes : côté c1 et côté a3.","ar":"أربع نجوم في مجموعتين: جهة c1 وجهة a3."},{"en":"Finish one cluster before crossing to the other.","fr":"Terminez un groupe avant de passer à l'autre.","ar":"أنهِ مجموعة قبل العبور إلى الأخرى."},{"en":"One road: f4, h6, c1, a3, e7.","fr":"Une route : f4, h6, c1, a3, e7.","ar":"طريق واحد: f4 ثم h6 ثم c1 ثم a3 ثم e7."}],"explain":{"en":"Cluster your targets: crossings between clusters cost extra moves.","fr":"Regroupez vos cibles : les traversées entre groupes coûtent des coups.","ar":"جمّع أهدافك: العبور بين المجموعات يكلّف نقلات."},"success":{"en":"Grand tour in 5 — diagonal mastery!","fr":"Grand tour en 5 — maîtrise des diagonales !","ar":"جولة كبرى في ٥ — إتقان الأقطار!"},"failHint":{"en":"f4–h6 share a road, a3–e7 share one. Cross once, in c1.","fr":"f4–h6 partagent une route, a3–e7 aussi. Traversez une fois, en c1.","ar":"f4–h6 على طريق واحد وa3–e7 كذلك. اعبر مرة واحدة عبر c1."},"xp":20},{"id":"s1q-1","stage":1,"group":"queen","themes":["queen","movement"],"mode":"free-move","type":"free-move","title":{"en":"Queen: the strong file","fr":"Dame : la colonne forte","ar":"الملكة: العمود القوي"},"intro":{"en":"The queen moves like a rook PLUS a bishop. Land on every star — the fewer moves, the more points!","fr":"La dame se déplace comme une tour PLUS un fou. Atteignez chaque étoile — moins de coups, plus de points !","ar":"تتحرك الملكة مثل الرخ والفيل معًا. قف على كل نجمة — كلما قلّت نقلاتك زادت نقاطك!"},"goalText":{"en":"Collect all 3 stars with the queen.","fr":"Ramassez les 3 étoiles avec la dame.","ar":"اجمع النجوم الثلاث بالملكة."},"fen":"7k/8/8/8/8/8/8/3QK3 w - - 0 1","movePieces":["q"],"goal":{"collect":["d4","d6","d8"]},"par":3,"maxMoves":8,"hints":[{"en":"The whole d-file is empty.","fr":"Toute la colonne d est vide.","ar":"العمود d فارغ تمامًا."},{"en":"Climb it star by star.","fr":"Montez étoile par étoile.","ar":"اصعده نجمةً نجمة."},{"en":"Play d4, d6, d8.","fr":"Jouez d4, d6, d8.","ar":"العب d4 ثم d6 ثم d8."}],"explain":{"en":"Queen power means options — but one star still needs one landing.","fr":"La puissance de la dame offre des options — mais chaque étoile exige son arrivée.","ar":"قوة الملكة تعني خيارات — لكن كل نجمة تحتاج وقفة."},"success":{"en":"Majestic climb — 3 for 3!","fr":"Montée majestueuse — 3 sur 3 !","ar":"صعود مهيب — ٣ من ٣!"},"failHint":{"en":"Straight up the d-file: d4, d6, d8.","fr":"Tout droit sur la colonne d : d4, d6, d8.","ar":"مباشرة في العمود d: d4 ثم d6 ثم d8."},"xp":10},{"id":"s1q-2","stage":1,"group":"queen","themes":["queen","movement"],"mode":"free-move","type":"free-move","title":{"en":"Queen: rook and bishop in one","fr":"Dame : tour et fou en une","ar":"الملكة: رخ وفيل معًا"},"goalText":{"en":"Collect all 3 stars using both queen powers.","fr":"Ramassez les 3 étoiles en utilisant les deux pouvoirs.","ar":"اجمع النجوم الثلاث باستخدام القوتين."},"fen":"4k3/8/8/8/8/8/8/3QK3 w - - 0 1","movePieces":["q"],"goal":{"collect":["h5","a5","a8"]},"par":3,"maxMoves":8,"hints":[{"en":"Start with the bishop-move: the d1–h5 diagonal.","fr":"Commencez par le coup de fou : la diagonale d1–h5.","ar":"ابدأ بحركة الفيل: قطر d1–h5."},{"en":"Then slide like a rook along rank 5 and file a.","fr":"Puis glissez comme une tour sur la rangée 5 et la colonne a.","ar":"ثم انزلق كالرخ على الصف الخامس والعمود a."},{"en":"Play h5, a5, a8.","fr":"Jouez h5, a5, a8.","ar":"العب h5 ثم a5 ثم a8."}],"explain":{"en":"Diagonal, rank, file — one tour uses every queen power.","fr":"Diagonale, rangée, colonne — un parcours utilise tous les pouvoirs.","ar":"قطر وصف وعمود — جولة واحدة تستخدم كل القوى."},"success":{"en":"Full powers unleashed!","fr":"Pleins pouvoirs déchaînés !","ar":"أُطلقت كل القوى!"},"failHint":{"en":"Bishop first (h5), then rook slides (a5, a8).","fr":"Fou d'abord (h5), puis glissades de tour (a5, a8).","ar":"الفيل أولًا (h5) ثم انزلاقات الرخ (a5 وa8)."},"xp":10},{"id":"s1q-3","stage":1,"group":"queen","themes":["queen","blocked-path"],"mode":"free-move","type":"free-move","title":{"en":"Queen: blocked file","fr":"Dame : colonne bloquée","ar":"الملكة: عمود مسدود"},"goalText":{"en":"Your pawn on d4 blocks the file. Collect both stars anyway.","fr":"Votre pion en d4 bloque la colonne. Ramassez les étoiles quand même.","ar":"بيدقك في d4 يسد العمود. اجمع النجمتين رغم ذلك."},"fen":"7k/8/8/8/3P4/8/8/3QK3 w - - 0 1","movePieces":["q"],"goal":{"collect":["d6","d8"]},"par":4,"maxMoves":10,"hints":[{"en":"d4 is occupied, so leave the file and come back from above.","fr":"d4 est occupée : quittez la colonne et revenez par le haut.","ar":"d4 مشغول: اخرج من العمود وعُد من الأعلى."},{"en":"The h5 square starts a road back to d5.","fr":"La case h5 ouvre une route vers d5.","ar":"المربع h5 يفتح طريقًا إلى d5."},{"en":"Play h5, d5, d6, d8.","fr":"Jouez h5, d5, d6, d8.","ar":"العب h5 ثم d5 ثم d6 ثم d8."}],"explain":{"en":"Queens detour like rooks when blocked — out, across, up, back.","fr":"Bloquée, la dame contourne comme une tour — sortie, traversée, montée, retour.","ar":"عند الانسداد تلتف الملكة كالرخ — خروج وعبور وصعود وعودة."},"success":{"en":"Blockade dissolved in 4!","fr":"Blocus dissous en 4 !","ar":"تبدد الحصار في ٤!"},"failHint":{"en":"Around, not through: h5, d5, d6, d8.","fr":"Autour, pas à travers : h5, d5, d6, d8.","ar":"حوله لا خلاله: h5 ثم d5 ثم d6 ثم d8."},"xp":15},{"id":"s1q-4","stage":1,"group":"queen","themes":["queen","capture"],"mode":"free-move","type":"free-move","title":{"en":"Queen: the hunting chain","fr":"Dame : la chaîne de chasse","ar":"الملكة: سلسلة الصيد"},"goalText":{"en":"Capture all 3 black pawns. Your g4 pawn guards the shortcut.","fr":"Capturez les 3 pions noirs. Votre pion g4 garde le raccourci.","ar":"التقط البيادق السوداء الثلاثة. بيدقك g4 يحرس الطريق المختصر."},"fen":"1k6/3p4/8/3p3p/6P1/8/8/3QK3 w - - 0 1","movePieces":["q"],"goal":{"capture":["d5","d7","h5"]},"par":4,"maxMoves":10,"hints":[{"en":"The d1–h5 diagonal is guarded by your own g4 pawn.","fr":"La diagonale d1–h5 est gardée par votre propre pion g4.","ar":"قطر d1–h5 يحرسه بيدقك g4."},{"en":"Climb the d-file eating as you go.","fr":"Montez la colonne d en mangeant au passage.","ar":"اصعد العمود d آكلًا في طريقك."},{"en":"Play xd5, xd7, h7, xxh5.","fr":"Jouez xd5, xd7, h7, xxh5.","ar":"العب xd5 ثم xd7 ثم h7 ثم xxh5."}],"explain":{"en":"Even queens take the stairs when the elevator is guarded.","fr":"Même les dames prennent l'escalier quand l'ascenseur est gardé.","ar":"حتى الملكات تصعد الدرج عندما يكون المصعد محروسًا."},"success":{"en":"Three pawns hunted down!","fr":"Trois pions chassés !","ar":"ثلاثة بيادق اصطيدت!"},"failHint":{"en":"Up the file first: d5, d7, then swing to h5.","fr":"D'abord la colonne : d5, d7, puis vers h5.","ar":"العمود أولًا: d5 ثم d7 ثم نحو h5."},"xp":15},{"id":"s1q-5","stage":1,"group":"queen","themes":["queen","obstacles"],"mode":"free-move","type":"free-move","title":{"en":"Queen: three roads closed","fr":"Dame : trois routes fermées","ar":"الملكة: ثلاث طرق مغلقة"},"goalText":{"en":"Reach h8. Three 2-move roads are lava — find the 3-move road.","fr":"Atteignez h8. Trois routes en 2 coups sont de la lave — trouvez celle en 3 coups.","ar":"اصِل إلى h8. ثلاثة طرق بنقلتين حمم — جد طريق النقلات الثلاث."},"fen":"8/k7/8/8/8/8/8/3QK3 w - - 0 1","movePieces":["q"],"goal":{"collect":["h8"]},"obstacles":["h1","d8","h5","g7"],"par":3,"maxMoves":8,"hints":[{"en":"h1, d8 and h5 each kill one 2-move road.","fr":"h1, d8 et h5 tuent chacune une route en 2 coups.","ar":"h1 وd8 وh5 تقتل كل منها طريق نقلتين."},{"en":"The a-file road survives.","fr":"La route de la colonne a survit.","ar":"طريق العمود a ناجٍ."},{"en":"Play a1, a8, h8.","fr":"Jouez a1, a8, h8.","ar":"العب a1 ثم a8 ثم h8."}],"explain":{"en":"Eliminate the blocked roads first; the survivor is your route.","fr":"Éliminez d'abord les routes bloquées ; la survivante est votre route.","ar":"استبعد الطرق المسدودة أولًا؛ الناجي هو طريقك."},"success":{"en":"Only road home found!","fr":"Seule route trouvée !","ar":"وجدت الطريق الوحيد!"},"failHint":{"en":"h1, d8, h5 burn — go a1, a8, h8.","fr":"h1, d8, h5 brûlent — passez par a1, a8, h8.","ar":"h1 وd8 وh5 تحرق — سِر a1 ثم a8 ثم h8."},"xp":15},{"id":"s1q-6","stage":1,"group":"queen","themes":["queen","route"],"mode":"free-move","type":"free-move","title":{"en":"Queen: the royal circuit","fr":"Dame : le circuit royal","ar":"الملكة: الدائرة الملكية"},"goalText":{"en":"Collect all 5 stars in one royal circuit.","fr":"Ramassez les 5 étoiles en un circuit royal.","ar":"اجمع النجوم الخمس في دائرة ملكية واحدة."},"fen":"8/8/8/8/8/2k5/8/3QK3 w - - 0 1","movePieces":["q"],"goal":{"collect":["h5","a5","a8","h8","e8"]},"par":5,"maxMoves":12,"hints":[{"en":"Five stars need five landings — no wasted transit allowed.","fr":"Cinq étoiles exigent cinq arrivées — aucun transit perdu.","ar":"خمس نجوم تحتاج خمس وقفات — لا عبور ضائع."},{"en":"Diagonal out, then sweep the edges home.","fr":"Diagonale de sortie, puis balayez les bords.","ar":"قطر للخروج ثم امسح الحواف عائدًا."},{"en":"One circuit: h5, a5, a8, h8, e8.","fr":"Un circuit : h5, a5, a8, h8, e8.","ar":"دائرة واحدة: h5 ثم a5 ثم a8 ثم h8 ثم e8."}],"explain":{"en":"Five targets, five landings: every move must collect.","fr":"Cinq cibles, cinq arrivées : chaque coup doit ramasser.","ar":"خمسة أهداف وخمس وقفات: كل نقلة يجب أن تجمع."},"success":{"en":"Royal circuit in 5 — flawless!","fr":"Circuit royal en 5 — sans faute !","ar":"دائرة ملكية في ٥ — بلا خطأ!"},"failHint":{"en":"h5–a5–a8–h8–e8: never land empty.","fr":"h5–a5–a8–h8–e8 : ne vous arrêtez jamais à vide.","ar":"h5–a5–a8–h8–e8: لا تقف فارغًا أبدًا."},"xp":20},{"id":"s1k-1","stage":1,"group":"king","themes":["king","movement"],"mode":"free-move","type":"free-move","title":{"en":"King: one step at a time","fr":"Roi : un pas à la fois","ar":"الملك: خطوة واحدة كل مرة"},"intro":{"en":"The king moves exactly one square in any direction. Collect the stairs — slow and safe wins!","fr":"Le roi avance d'exactement une case dans toute direction. Ramassez l'escalier — doucement et sûrement !","ar":"يتحرك الملك مربعًا واحدًا فقط في أي اتجاه. اجمع الدرج — البطء والأمان يفوزان!"},"goalText":{"en":"Climb the stairs: collect all 3 stars.","fr":"Montez l'escalier : ramassez les 3 étoiles.","ar":"اصعد الدرج: اجمع النجوم الثلاث."},"fen":"4k3/8/8/8/8/8/8/4K3 w - - 0 1","movePieces":["k"],"goal":{"collect":["e2","e3","e4"]},"par":3,"maxMoves":8,"hints":[{"en":"One square per move — no rushing, even for kings.","fr":"Une case par coup — pas de précipitation, même pour les rois.","ar":"مربع واحد كل نقلة — لا استعجال حتى للملوك."},{"en":"Straight up the e-file.","fr":"Tout droit sur la colonne e.","ar":"مباشرة في العمود e."},{"en":"Play e2, e3, e4.","fr":"Jouez e2, e3, e4.","ar":"العب e2 ثم e3 ثم e4."}],"explain":{"en":"Three stairs, three steps: the king's pace sets the par.","fr":"Trois marches, trois pas : le rythme du roi fixe le par.","ar":"ثلاث درجات وثلاث خطوات: إيقاع الملك يحدد العدد."},"success":{"en":"Steady climb — a careful king lives long!","fr":"Montée tranquille — un roi prudent vit longtemps !","ar":"صعود ثابت — الملك الحذر يعيش طويلًا!"},"failHint":{"en":"Up, up, up: e2, e3, e4.","fr":"Haut, haut, haut : e2, e3, e4.","ar":"اصعد اصعد اصعد: e2 ثم e3 ثم e4."},"xp":10},{"id":"s1k-2","stage":1,"group":"king","themes":["king","movement"],"mode":"free-move","type":"free-move","title":{"en":"King: around the corner","fr":"Roi : autour du coin","ar":"الملك: حول الزاوية"},"goalText":{"en":"Collect all 3 stars around the corner.","fr":"Ramassez les 3 étoiles autour du coin.","ar":"اجمع النجوم الثلاث حول الزاوية."},"fen":"4k3/8/8/8/8/8/8/4K3 w - - 0 1","movePieces":["k"],"goal":{"collect":["d1","d2","e2"]},"par":3,"maxMoves":8,"hints":[{"en":"The king turns corners one square at a time.","fr":"Le roi tourne les coins une case à la fois.","ar":"ينعطف الملك مربعًا مربعًا."},{"en":"Left, up, right.","fr":"Gauche, haut, droite.","ar":"يسار ثم صعود ثم يمين."},{"en":"Play d1, d2, e2.","fr":"Jouez d1, d2, e2.","ar":"العب d1 ثم d2 ثم e2."}],"explain":{"en":"Kings zigzag: every neighboring square is one move away.","fr":"Les rois zigzaguent : chaque case voisine est à un coup.","ar":"الملوك تتحرك متعرجة: كل مربع مجاور على بعد نقلة."},"success":{"en":"Corner rounded perfectly!","fr":"Virage parfait !","ar":"انعطاف مثالي!"},"failHint":{"en":"d1, then d2, then e2.","fr":"d1, puis d2, puis e2.","ar":"d1 ثم d2 ثم e2."},"xp":10},{"id":"s1k-3","stage":1,"group":"king","themes":["king","blocked-path"],"mode":"free-move","type":"free-move","title":{"en":"King: the pawn in the way","fr":"Roi : le pion gênant","ar":"الملك: البيدق المعترض"},"goalText":{"en":"Your pawn on e2 blocks the stairs. Reach e4 anyway.","fr":"Votre pion en e2 bloque l'escalier. Atteignez e4 quand même.","ar":"بيدقك في e2 يسد الدرج. اصِل إلى e4 رغم ذلك."},"fen":"4k3/8/8/8/8/8/4P3/4K3 w - - 0 1","movePieces":["k"],"goal":{"collect":["e3","e4"]},"par":3,"maxMoves":8,"hints":[{"en":"e2 is occupied — step around your own pawn.","fr":"e2 est occupée — contournez votre propre pion.","ar":"e2 مشغول — التفّ حول بيدقك."},{"en":"Sidestep to d2 first.","fr":"Écartez-vous en d2 d'abord.","ar":"انحرف إلى d2 أولًا."},{"en":"Play d2, e3, e4.","fr":"Jouez d2, e3, e4.","ar":"العب d2 ثم e3 ثم e4."}],"explain":{"en":"Friendly pieces block too — sidestep and rejoin the road.","fr":"Les pièces amies bloquent aussi — écartez-vous et rejoignez la route.","ar":"القطع الصديقة تعترض أيضًا — انحرف وعُد إلى الطريق."},"success":{"en":"Pawn politely sidestepped!","fr":"Pion poliment contourné !","ar":"التففت حول البيدق بأدب!"},"failHint":{"en":"Around the pawn: d2, e3, e4.","fr":"Autour du pion : d2, e3, e4.","ar":"حول البيدق: d2 ثم e3 ثم e4."},"xp":15},{"id":"s1k-4","stage":1,"group":"king","themes":["king","capture"],"mode":"free-move","type":"free-move","title":{"en":"King: eat the pawns","fr":"Roi : mangez les pions","ar":"الملك: كُل البيادق"},"goalText":{"en":"Capture both black pawns. Pawns defend each other — take the lonely one first!","fr":"Capturez les deux pions noirs. Les pions se défendent — prenez le solitaire d'abord !","ar":"التقط البيدقين الأسودين. البيادق تحمي بعضها — خذ المنعزل أولًا!"},"fen":"k7/8/8/8/8/5p2/3p4/4K3 w - - 0 1","movePieces":["k"],"goal":{"capture":["d2","f3"]},"par":3,"maxMoves":8,"hints":[{"en":"d2 is undefended — but f3 is watched by no one either. Start close.","fr":"d2 est sans défense — f3 non plus. Commencez près.","ar":"d2 بلا حماية — وf3 أيضًا. ابدأ من القريب."},{"en":"After xd2, step to e3 to reach f3.","fr":"Après xd2, passez par e3 pour atteindre f3.","ar":"بعد xd2 مر عبر e3 لتصل f3."},{"en":"Play xd2, e3, xf3.","fr":"Jouez xd2, e3, xf3.","ar":"العب xd2 ثم e3 ثم xf3."}],"explain":{"en":"Never capture a defended piece with your king — take the free one, then step over.","fr":"Ne capturez jamais une pièce défendue avec le roi — prenez la gratuite, puis avancez.","ar":"لا تلتقط أبدًا قطعة محمية بملكك — خذ الحرة ثم تقدّم."},"success":{"en":"Safe feasts only — royal wisdom!","fr":"Festins sûrs uniquement — sagesse royale !","ar":"ولائم آمنة فقط — حكمة ملكية!"},"failHint":{"en":"xd2 first (it's free), transit e3, then xf3.","fr":"xd2 d'abord (gratuit), transit e3, puis xf3.","ar":"xd2 أولًا (مجاني) ثم عبور e3 ثم xf3."},"xp":15},{"id":"s1k-5","stage":1,"group":"king","themes":["king","danger"],"mode":"free-move","type":"free-move","title":{"en":"King: danger squares","fr":"Roi : cases dangereuses","ar":"الملك: المربعات الخطرة"},"goalText":{"en":"The bishop covers e2 and f1 — a king may never enter danger. Collect both stars.","fr":"Le fou couvre e2 et f1 — un roi n'entre jamais en danger. Ramassez les étoiles.","ar":"الفيل يغطي e2 وf1 — الملك لا يدخل الخطر أبدًا. اجمع النجمتين."},"fen":"k7/8/8/8/8/3b4/8/4K3 w - - 0 1","movePieces":["k"],"goal":{"collect":["d2","f2"]},"avoidAttacked":true,"par":3,"maxMoves":8,"hints":[{"en":"e2 and f1 are attacked — the level rejects them.","fr":"e2 et f1 sont attaquées — le niveau les refuse.","ar":"e2 وf1 مهددتان — المستوى يرفضهما."},{"en":"Safe roads only: d2 is safe, and so is f2.","fr":"Routes sûres uniquement : d2 est sûre, f2 aussi.","ar":"الطرق الآمنة فقط: d2 آمن وf2 آمن."},{"en":"Play d2, e3, f2 — or f2, e3, d2.","fr":"Jouez d2, e3, f2 — ou f2, e3, d2.","ar":"العب d2 ثم e3 ثم f2 — أو f2 ثم e3 ثم d2."}],"explain":{"en":"Kings never step onto attacked squares — the rule is built into every king move.","fr":"Les rois ne vont jamais sur des cases attaquées — la règle est dans chaque coup de roi.","ar":"الملوك لا تخطو أبدًا على مربعات مهددة — القاعدة في كل حركة ملك."},"success":{"en":"Danger read perfectly — royal safety first!","fr":"Danger lu parfaitement — sécurité royale d'abord !","ar":"قرأت الخطر تمامًا — سلامة الملك أولًا!"},"failHint":{"en":"e2 and f1 burn. Walk d2–e3–f2.","fr":"e2 et f1 brûlent. Marchez d2–e3–f2.","ar":"e2 وf1 تحرقان. امشِ d2–e3–f2."},"xp":15},{"id":"s1k-6","stage":1,"group":"king","themes":["king","route"],"mode":"free-move","type":"free-move","title":{"en":"King: the royal patrol","fr":"Roi : la patrouille royale","ar":"الملك: الدورية الملكية"},"goalText":{"en":"Patrol all 4 corners of your little square. Plan the loop!","fr":"Patrouillez les 4 coins de votre petit carré. Planifiez la boucle !","ar":"اجُب الزوايا الأربع لمربعك الصغير. خطط الدورة!"},"fen":"4k3/8/8/8/8/8/8/4K3 w - - 0 1","movePieces":["k"],"goal":{"collect":["d1","d2","f2","f1"]},"par":5,"maxMoves":12,"hints":[{"en":"Four corners need four visits plus one crossing.","fr":"Quatre coins exigent quatre visites plus une traversée.","ar":"الزوايا الأربع تحتاج أربع زيارات زائد عبور."},{"en":"Sweep one side, cross over, sweep back.","fr":"Balayez un côté, traversez, revenez.","ar":"امسح جهة ثم اعبر ثم عُد."},{"en":"One loop: d1, d2, e3, f2, f1.","fr":"Une boucle : d1, d2, e3, f2, f1.","ar":"دورة واحدة: d1 ثم d2 ثم e3 ثم f2 ثم f1."}],"explain":{"en":"Crossing between clusters costs a move — minimize crossings.","fr":"Traverser entre groupes coûte un coup — minimisez les traversées.","ar":"العبور بين المجموعات يكلّف نقلة — قلّل العبور."},"success":{"en":"Patrol complete in 5 — every corner salutes!","fr":"Patrouille terminée en 5 — chaque coin salue !","ar":"اكتملت الدورية في ٥ — كل زاوية تحيّي!"},"failHint":{"en":"d1–d2, cross via e3, f2–f1.","fr":"d1–d2, traversez par e3, f2–f1.","ar":"d1–d2 ثم اعبر عبر e3 ثم f2–f1."},"xp":20},{"id":"s1n-1","stage":1,"group":"knight","themes":["knight","movement"],"mode":"free-move","type":"free-move","title":{"en":"Knight: the L jump","fr":"Cavalier : le saut en L","ar":"الحصان: قفزة L"},"intro":{"en":"The knight jumps in an L and over everything. Collect the stars — fewer jumps, more points!","fr":"Le cavalier saute en L et par-dessus tout. Ramassez les étoiles — moins de sauts, plus de points !","ar":"يقفز الحصان على شكل L وفوق كل شيء. اجمع النجوم — قفزات أقل تعني نقاطًا أكثر!"},"goalText":{"en":"Collect both stars with the knight.","fr":"Ramassez les 2 étoiles avec le cavalier.","ar":"اجمع النجمتين بالحصان."},"fen":"4k3/8/8/8/8/8/8/4K1N1 w - - 0 1","movePieces":["n"],"goal":{"collect":["f3","h4"]},"par":2,"maxMoves":8,"hints":[{"en":"L means two squares one way, one square sideways.","fr":"L signifie deux cases dans un sens, une sur le côté.","ar":"يعني L مربعين في اتجاه ومربعًا جانبًا."},{"en":"From g1, f3 is one L away.","fr":"Depuis g1, f3 est à un L.","ar":"من g1 تبلغ f3 بقفزة L واحدة."},{"en":"Play f3, then h4.","fr":"Jouez f3, puis h4.","ar":"العب f3 ثم h4."}],"explain":{"en":"Each landing must be an L away — count two-plus-one every time.","fr":"Chaque arrivée doit être à un L — comptez deux-plus-un à chaque fois.","ar":"كل وقفة يجب أن تبعد L — احسب اثنين زائد واحد كل مرة."},"success":{"en":"Two clean Ls — the knight's dance begins!","fr":"Deux beaux L — la danse du cavalier commence !","ar":"حرفا L نظيفان — بدأت رقصة الحصان!"},"failHint":{"en":"g1 to f3 to h4 — two Ls.","fr":"g1 vers f3 vers h4 — deux L.","ar":"g1 إلى f3 إلى h4 — حرفا L."},"xp":10},{"id":"s1n-2","stage":1,"group":"knight","themes":["knight","movement"],"mode":"free-move","type":"free-move","title":{"en":"Knight: zigzag climb","fr":"Cavalier : montée en zigzag","ar":"الحصان: صعود متعرج"},"goalText":{"en":"Zigzag up the board collecting all 3 stars.","fr":"Montez en zigzag en ramassant les 3 étoiles.","ar":"اصعد متعرجًا جامعًا النجوم الثلاث."},"fen":"4k3/8/8/8/8/8/8/4K1N1 w - - 0 1","movePieces":["n"],"goal":{"collect":["e2","f4","d5"]},"par":3,"maxMoves":8,"hints":[{"en":"Knights zigzag: each jump changes direction.","fr":"Les cavaliers zigzaguent : chaque saut change de direction.","ar":"الحصان يتعرج: كل قفزة تغيّر الاتجاه."},{"en":"e2 is one L from g1.","fr":"e2 est à un L de g1.","ar":"e2 على بعد L واحدة من g1."},{"en":"Play e2, f4, d5.","fr":"Jouez e2, f4, d5.","ar":"العب e2 ثم f4 ثم d5."}],"explain":{"en":"Chain Ls tip-to-tail: the landing square aims the next jump.","fr":"Enchaînez les L bout à bout : l'arrivée vise le saut suivant.","ar":"سلسِل L طرفًا بطرف: مربع الوصول يوجّه القفزة التالية."},"success":{"en":"Zigzag perfect — three landings, three stars!","fr":"Zigzag parfait — trois arrivées, trois étoiles !","ar":"تعرج مثالي — ثلاث وقفات وثلاث نجوم!"},"failHint":{"en":"e2, then f4, then d5.","fr":"e2, puis f4, puis d5.","ar":"e2 ثم f4 ثم d5."},"xp":10},{"id":"s1n-3","stage":1,"group":"knight","themes":["knight","blocked-path"],"mode":"free-move","type":"free-move","title":{"en":"Knight: the covered square","fr":"Cavalier : la case couverte","ar":"الحصان: المربع المغطى"},"goalText":{"en":"e2 is covered — knights can't land there. Collect both stars anyway.","fr":"e2 est couverte — impossible d'y atterrir. Ramassez les étoiles quand même.","ar":"e2 مغطى — لا يمكن الوقوف عليه. اجمع النجمتين رغم ذلك."},"fen":"4k3/8/8/8/8/8/8/4K1N1 w - - 0 1","movePieces":["n"],"goal":{"collect":["f3","d4"]},"obstacles":["e2"],"par":2,"maxMoves":8,"hints":[{"en":"Knights jump OVER blockers — only the landing square matters.","fr":"Les cavaliers sautent PAR-DESSUS — seule l'arrivée compte.","ar":"الحصان يقفز فوق العوائق — مربع الوصول وحده يهم."},{"en":"e2 is lava for landing, but f3 is free.","fr":"e2 est de la lave pour atterrir, mais f3 est libre.","ar":"e2 حمم للوقوف لكن f3 حر."},{"en":"Play f3, then d4.","fr":"Jouez f3, puis d4.","ar":"العب f3 ثم d4."}],"explain":{"en":"Nothing blocks a knight mid-jump — obstacles only deny landings.","fr":"Rien ne bloque un cavalier en l'air — les obstacles nient seulement les arrivées.","ar":"لا شيء يعترض الحصان في الهواء — العوائق تمنع الوقوف فقط."},"success":{"en":"Jumped clean over the trouble!","fr":"Sauté par-dessus les ennuis !","ar":"قفزت فوق المتاعب بنظافة!"},"failHint":{"en":"Forget e2 — fly f3, then d4.","fr":"Oubliez e2 — volez vers f3, puis d4.","ar":"انسَ e2 — طِر إلى f3 ثم d4."},"xp":15},{"id":"s1n-4","stage":1,"group":"knight","themes":["knight","capture"],"mode":"free-move","type":"free-move","title":{"en":"Knight: the capture ladder","fr":"Cavalier : l'échelle des captures","ar":"الحصان: سلم الالتقاط"},"goalText":{"en":"Capture all 3 black pawns climbing the ladder.","fr":"Capturez les 3 pions noirs en montant l'échelle.","ar":"التقط البيادق السوداء الثلاثة صاعدًا السلم."},"fen":"k7/3p4/8/4p3/8/5p2/8/4K1N1 w - - 0 1","movePieces":["n"],"goal":{"capture":["f3","e5","d7"]},"par":3,"maxMoves":8,"hints":[{"en":"Each pawn sits exactly one L from the last.","fr":"Chaque pion est à exactement un L du précédent.","ar":"كل بيدق على بعد L واحدة من سابقه."},{"en":"Start at the bottom: f3.","fr":"Commencez en bas : f3.","ar":"ابدأ من الأسفل: f3."},{"en":"Play xxf3, xxe5, xxd7.","fr":"Jouez xxf3, xxe5, xxd7.","ar":"العب xxf3 ثم xxe5 ثم xxd7."}],"explain":{"en":"Captures chain when each victim aims the next L.","fr":"Les captures s'enchaînent quand chaque victime vise le L suivant.","ar":"تتسلسل الالتقاطات عندما توجّه كل ضحية L التالية."},"success":{"en":"Ladder climbed, three pawns eaten!","fr":"Échelle grimpée, trois pions mangés !","ar":"صعدت السلم وأكلت ثلاثة بيادق!"},"failHint":{"en":"Up the ladder: f3, e5, d7.","fr":"Montez l'échelle : f3, e5, d7.","ar":"اصعد السلم: f3 ثم e5 ثم d7."},"xp":15},{"id":"s1n-5","stage":1,"group":"knight","themes":["knight","obstacles"],"mode":"free-move","type":"free-move","title":{"en":"Knight: the obvious square burns","fr":"Cavalier : la case évidente brûle","ar":"الحصان: المربع الواضح يحرق"},"goalText":{"en":"f3 looks tempting but it's lava. Collect all 3 stars the long way.","fr":"f3 semble tentante mais c'est de la lave. Ramassez les étoiles par le long chemin.","ar":"f3 يبدو مغريًا لكنه حمم. اجمع النجوم الثلاث بالطريق الطويل."},"fen":"4k3/8/8/8/8/8/8/4K1N1 w - - 0 1","movePieces":["n"],"goal":{"collect":["e2","g3","h5"]},"obstacles":["f3"],"par":3,"maxMoves":8,"hints":[{"en":"f3 burns — take the quiet e2 road instead.","fr":"f3 brûle — prenez plutôt la route tranquille e2.","ar":"f3 تحرق — اسلك طريق e2 الهادئ بدلًا منها."},{"en":"e2, g3, h5 link tip-to-tail.","fr":"e2, g3, h5 s'enchaînent.","ar":"e2 وg3 وh5 تتسلسل."},{"en":"Play e2, g3, h5.","fr":"Jouez e2, g3, h5.","ar":"العب e2 ثم g3 ثم h5."}],"explain":{"en":"The flashiest square is often bait — the quiet road collects more.","fr":"La case la plus voyante est souvent un appât — la route discrète rapporte plus.","ar":"المربع الأبرز غالبًا طُعم — الطريق الهادئ يجمع أكثر."},"success":{"en":"Bait ignored — patient knight wins!","fr":"Appât ignoré — le cavalier patient gagne !","ar":"تجاهلت الطعم — الحصان الصبور يفوز!"},"failHint":{"en":"Around the lava: e2, g3, h5.","fr":"Autour de la lave : e2, g3, h5.","ar":"حول الحمم: e2 ثم g3 ثم h5."},"xp":15},{"id":"s1n-6","stage":1,"group":"knight","themes":["knight","route"],"mode":"free-move","type":"free-move","title":{"en":"Knight: the five-jump tour","fr":"Cavalier : le tour en cinq sauts","ar":"الحصان: جولة القفزات الخمس"},"goalText":{"en":"Collect all 5 stars. Every jump must land a star — plan it!","fr":"Ramassez les 5 étoiles. Chaque saut doit rapporter — planifiez !","ar":"اجمع النجوم الخمس. كل قفزة يجب أن تجمع — خطط!"},"fen":"4k3/8/8/8/8/8/8/4K1N1 w - - 0 1","movePieces":["n"],"goal":{"collect":["f3","h4","f5","e3","d5"]},"par":5,"maxMoves":12,"hints":[{"en":"Five stars, five landings — zero transit allowed.","fr":"Cinq étoiles, cinq arrivées — aucun transit permis.","ar":"خمس نجوم وخمس وقفات — لا عبور مسموح."},{"en":"Start f3–h4 along the edge, then turn inward.","fr":"Commencez f3–h4 le long du bord, puis rentrez.","ar":"ابدأ f3–h4 على الحافة ثم ادخل."},{"en":"One tour: f3, h4, f5, e3, d5.","fr":"Un parcours : f3, h4, f5, e3, d5.","ar":"جولة واحدة: f3 ثم h4 ثم f5 ثم e3 ثم d5."}],"explain":{"en":"Perfect tours never land empty: each arrival aims the next.","fr":"Les parcours parfaits n'arrivent jamais à vide : chaque arrivée vise la suivante.","ar":"الجولات المثالية لا تقف فارغة أبدًا: كل وصول يوجّه التالي."},"success":{"en":"Five jumps, five stars — knight grandmaster!","fr":"Cinq sauts, cinq étoiles — grand maître cavalier !","ar":"خمس قفزات وخمس نجوم — أستاذ حصان كبير!"},"failHint":{"en":"f3–h4–f5–e3–d5: every landing counts.","fr":"f3–h4–f5–e3–d5 : chaque arrivée compte.","ar":"f3–h4–f5–e3–d5: كل وقفة محسوبة."},"xp":20},{"id":"s1p-1","stage":1,"group":"pawn","themes":["pawn","movement"],"mode":"free-move","type":"free-move","title":{"en":"Pawn: march ahead","fr":"Pion : en avant","ar":"البيدق: إلى الأمام"},"intro":{"en":"Pawns march straight ahead, never back. Collect the stairs — steady pawns win points!","fr":"Les pions avancent tout droit, jamais en arrière. Ramassez l'escalier — les pions réguliers gagnent !","ar":"تتقدم البيادق للأمام فقط ولا تعود أبدًا. اجمع الدرج — البيادق الثابتة تكسب!"},"goalText":{"en":"March up and collect both stars.","fr":"Avancez et ramassez les deux étoiles.","ar":"تقدّم واجمع النجمتين."},"fen":"4k3/8/8/8/8/8/4P3/4K3 w - - 0 1","movePieces":["p"],"goal":{"collect":["e3","e4"]},"par":2,"maxMoves":8,"hints":[{"en":"Pawns step one square straight ahead.","fr":"Les pions avancent d'une case tout droit.","ar":"يتقدم البيدق مربعًا واحدًا للأمام."},{"en":"Don't double-jump: you'd skip e3 forever.","fr":"Pas de double saut : vous rateriez e3 pour toujours.","ar":"لا تقفز قفزة مزدوجة: ستفوت e3 للأبد."},{"en":"Play e3, then e4.","fr":"Jouez e3, puis e4.","ar":"العب e3 ثم e4."}],"explain":{"en":"Pawns never move backward — skipped stars stay skipped.","fr":"Les pions ne reculent jamais — les étoiles ratées restent ratées.","ar":"البيادق لا تتراجع أبدًا — النجوم الفائتة تبقى فائتة."},"success":{"en":"Steady march — no star left behind!","fr":"Marche régulière — aucune étoile oubliée !","ar":"مسيرة ثابتة — لا نجمة تُركت!"},"failHint":{"en":"One step at a time: e3, then e4.","fr":"Un pas à la fois : e3, puis e4.","ar":"خطوة كل مرة: e3 ثم e4."},"xp":10},{"id":"s1p-2","stage":1,"group":"pawn","themes":["pawn","capture"],"mode":"free-move","type":"free-move","title":{"en":"Pawn: take diagonally","fr":"Pion : prendre en diagonale","ar":"البيدق: الالتقاط قطريًا"},"goalText":{"en":"Capture the pawn, then collect the star.","fr":"Capturez le pion, puis ramassez l'étoile.","ar":"التقط البيدق ثم اجمع النجمة."},"fen":"4k3/8/8/8/8/3p4/4P3/4K3 w - - 0 1","movePieces":["p"],"goal":{"capture":["d3"],"collect":["d4"]},"par":2,"maxMoves":8,"hints":[{"en":"Pawns walk straight but capture one square diagonally.","fr":"Les pions marchent droit mais capturent d'une case en diagonale.","ar":"تمشي البيادق مستقيمة لكنها تلتقط قطريًا بمربع واحد."},{"en":"The d3 pawn stands on your diagonal.","fr":"Le pion d3 est sur votre diagonale.","ar":"بيدق d3 على قطرك."},{"en":"Play exd3, then d4.","fr":"Jouez exd3, puis d4.","ar":"العب exd3 ثم d4."}],"explain":{"en":"Straight to walk, diagonal to eat — the pawn's two rules.","fr":"Droit pour marcher, diagonale pour manger — les deux règles du pion.","ar":"مستقيم للمشي وقطري للأكل — قاعدتا البيدق."},"success":{"en":"Take and march — pawn essentials!","fr":"Prendre et marcher — l'essentiel du pion !","ar":"التقط وتقدّم — أساسيات البيدق!"},"failHint":{"en":"Eat first (exd3), then march (d4).","fr":"Mangez d'abord (exd3), puis marchez (d4).","ar":"كُل أولًا (exd3) ثم تقدّم (d4)."},"xp":10},{"id":"s1p-3","stage":1,"group":"pawn","themes":["pawn","blocked-path"],"mode":"free-move","type":"free-move","title":{"en":"Pawn: blocked road","fr":"Pion : route bloquée","ar":"البيدق: طريق مسدود"},"goalText":{"en":"An enemy pawn blocks your file. Go around it and collect both stars.","fr":"Un pion ennemi bloque votre colonne. Contournez-le et ramassez les étoiles.","ar":"بيدق عدو يسد عمودك. التفّ حوله واجمع النجمتين."},"fen":"4k3/8/8/8/8/3pp3/4P3/4K3 w - - 0 1","movePieces":["p"],"goal":{"collect":["d4","d5"]},"par":3,"maxMoves":8,"hints":[{"en":"e3 blocks every straight push.","fr":"e3 bloque toute poussée droite.","ar":"e3 يسد كل دفعة مستقيمة."},{"en":"But d3 is capturable — take it and switch files.","fr":"Mais d3 est prenable — prenez-le et changez de colonne.","ar":"لكن d3 قابل للالتقاط — خذه وغيّر العمود."},{"en":"Play exd3, d4, d5.","fr":"Jouez exd3, d4, d5.","ar":"العب exd3 ثم d4 ثم d5."}],"explain":{"en":"A capture can change files — the pawn's only way around a wall.","fr":"Une capture peut changer de colonne — le seul contournement du pion.","ar":"الالتقاط قد يغيّر العمود — المخرج الوحيد للبيدق حول الجدار."},"success":{"en":"Wall outflanked by capture!","fr":"Mur contourné par capture !","ar":"التففت على الجدار بالالتقاط!"},"failHint":{"en":"Straight is dead — capture to d3, then climb.","fr":"Tout droit est mort — capturez en d3, puis montez.","ar":"المستقيم ميت — التقط إلى d3 ثم اصعد."},"xp":15},{"id":"s1p-4","stage":1,"group":"pawn","themes":["pawn","capture"],"mode":"free-move","type":"free-move","title":{"en":"Pawn: the capture trail","fr":"Pion : la piste des captures","ar":"البيدق: درب الالتقاط"},"goalText":{"en":"Capture both black pawns.","fr":"Capturez les deux pions noirs.","ar":"التقط البيدقين الأسودين."},"fen":"4k3/8/8/1p6/8/2p5/3P4/4K3 w - - 0 1","movePieces":["p"],"goal":{"capture":["c3","b5"]},"par":3,"maxMoves":8,"hints":[{"en":"Captures zigzag the pawn across files.","fr":"Les captures font zigzaguer le pion entre les colonnes.","ar":"الالتقاطات تجعل البيدق يتعرج بين الأعمدة."},{"en":"d2 takes c3 first.","fr":"d2 prend c3 d'abord.","ar":"d2 يأخذ c3 أولًا."},{"en":"Play dxc3, c4, cxb5.","fr":"Jouez dxc3, c4, cxb5.","ar":"العب dxc3 ثم c4 ثم cxb5."}],"explain":{"en":"Two captures, one transit: zigzag costs a middle step.","fr":"Deux captures, un transit : le zigzag coûte un pas intermédiaire.","ar":"التقاطان وعبور واحد: التعرج يكلّف خطوة وسطى."},"success":{"en":"Trail of captures complete!","fr":"Piste des captures terminée !","ar":"اكتمل درب الالتقاط!"},"failHint":{"en":"c3, step, b5: dxc3, c4, cxb5.","fr":"c3, pas, b5 : dxc3, c4, cxb5.","ar":"c3 ثم خطوة ثم b5: dxc3 ثم c4 ثم cxb5."},"xp":15},{"id":"s1p-5","stage":1,"group":"pawn","themes":["pawn","capture"],"mode":"free-move","type":"free-move","title":{"en":"Pawn: capture and promote-march","fr":"Pion : capturer puis monter","ar":"البيدق: التقط ثم اصعد"},"goalText":{"en":"Capture twice, then march the star home.","fr":"Capturez deux fois, puis ramenez l'étoile.","ar":"التقط مرتين ثم اصعد بالنجمة."},"fen":"4k3/8/8/1p6/8/2p5/3P4/4K3 w - - 0 1","movePieces":["p"],"goal":{"capture":["c3","b5"],"collect":["b7"]},"par":5,"maxMoves":12,"hints":[{"en":"Same trail as before — then keep marching.","fr":"Même piste qu'avant — puis continuez à monter.","ar":"نفس الدرب السابق — ثم واصل الصعود."},{"en":"After b5, single steps only: moved pawns lose the double push.","fr":"Après b5, que des petits pas : un pion déplacé perd la double poussée.","ar":"بعد b5 خطوات مفردة فقط: البيدق المتحرك يفقد الدفعة المزدوجة."},{"en":"Play dxc3, c4, cxb5, b6, b7.","fr":"Jouez dxc3, c4, cxb5, b6, b7.","ar":"العب dxc3 ثم c4 ثم cxb5 ثم b6 ثم b7."}],"explain":{"en":"The double push is one-time-only: plan around single steps after.","fr":"La double poussée est unique : prévoyez des petits pas ensuite.","ar":"الدفعة المزدوجة لمرة واحدة: خطط لخطوات مفردة بعدها."},"success":{"en":"Five-move masterpiece march!","fr":"Marche chef-d'œuvre en cinq coups !","ar":"مسيرة رائعة في خمس نقلات!"},"failHint":{"en":"dxc3, c4, cxb5, b6, b7.","fr":"dxc3, c4, cxb5, b6, b7.","ar":"dxc3 ثم c4 ثم cxb5 ثم b6 ثم b7."},"xp":15},{"id":"s1p-6","stage":1,"group":"pawn","themes":["pawn","promotion"],"mode":"free-move","type":"free-move","title":{"en":"Pawn: promote and conquer","fr":"Pion : promouvoir et conquérir","ar":"البيدق: رقِّ واسُد"},"goalText":{"en":"Push to the last rank, promote, then rule h8.","fr":"Poussez jusqu'au bout, promovez, puis régnez sur h8.","ar":"ادفع حتى الصف الأخير ورقِّ ثم احكم h8."},"fen":"8/4k3/P7/8/8/8/8/4K3 w - - 0 1","movePieces":["p","q","r","b","n"],"goal":{"reach":{"square":"h8"}},"par":3,"maxMoves":8,"hints":[{"en":"A pawn on its 7th rank is one step from glory.","fr":"Un pion au 7e rang est à un pas de la gloire.","ar":"البيدق في الصف السابع على بعد خطوة من المجد."},{"en":"Promote first — almost always to queen.","fr":"Promovez d'abord — presque toujours en dame.","ar":"رقِّ أولًا — غالبًا إلى ملكة."},{"en":"Play a7, a8=Q, Qh8.","fr":"Jouez a7, a8=D, Dh8.","ar":"العب a7 ثم a8=Q ثم Qh8."}],"explain":{"en":"Promotion turns your weakest piece into your strongest — then it rules.","fr":"La promotion change votre pièce la plus faible en plus forte — puis elle règne.","ar":"الترقية تحوّل أضعف قطعك إلى أقواها — ثم تحكم."},"success":{"en":"Crowned! From pawn to ruler of h8!","fr":"Couronné ! De pion à maître de h8 !","ar":"تُوّجت! من بيدق إلى حاكم h8!"},"failHint":{"en":"Climb, crown, conquer: a7, a8, h8.","fr":"Montez, couronnez, conquérez : a7, a8, h8.","ar":"اصعد وتوَّج واسُد: a7 ثم a8 ثم h8."},"xp":20}]};


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

const CURRICULUM_VERSION = 1;
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
    if (!LEVEL_TYPES.includes(lv.type)) errors.push(`${path}: unknown type ${JSON.stringify(lv.type)}`);
    t(lv.title, path, errors, warnings, 'title');
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
        if (!g) errors.push(`${path}: goal object required for free-move ({collect,capture,reach})`);
        else {
            const hasCollect = Array.isArray(g.collect) && g.collect.length > 0;
            const hasCapture = Array.isArray(g.capture) && g.capture.length > 0;
            const hasReach = g.reach && typeof g.reach.square === 'string';
            if (!hasCollect && !hasCapture && !hasReach) {
                errors.push(`${path}: goal needs collect[], capture[] or reach.square`);
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
    const stageNos = new Set((data.stages || []).map((s) => s.n));
    const seen = new Set();
    for (const lv of data.levels || []) {
        validateLevelSchema(lv, seen, errors, warnings);
        if (Number.isInteger(lv.stage) && !stageNos.has(lv.stage)) {
            errors.push(`level ${lv.id}: stage ${lv.stage} not in stages[]`);
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
                const lastMove = { to: m.to, mover, promoted: promo };
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

const { pathBetween, solveFreeMove } = __req("lessons");
const { starsForPar, pointsFor } = __req("storage");

const PROMO_PIECES = ['q', 'r', 'b', 'n'];
const EMPTY = [];

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
                g.load(parts.join(' '));
            },
            snapshot: () => g.fen(),
            restore: (snap) => { g.load(snap); },
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
                    g.load(parts.join(' '));
                    return g.moves({ verbose: true }).some((m) => m.to === sq);
                } finally {
                    g.load(saved);
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
                return { captured: res.captured || null, specialMove: null, promotion: res.promotion || null, epCapture };
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
            game.load(parts.join(' '));
            return game.moves({ verbose: true }).some((m) => m.to === sq);
        } finally {
            game.load(saved);
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

    function checkDone(lastTo, moverType, promoted) {
        for (const s of wantCollect) if (!st.collected.has(s)) return false;
        for (const s of wantCapture) if (!st.captured.has(s)) return false;
        if (reach) {
            if (lastTo !== reach.square) return false;
            if (reach.piece && moverType !== reach.piece.toLowerCase() &&
                (promoted || '').toLowerCase() !== reach.piece.toLowerCase()) return false;
        }
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
            // Extra-turn rule: force the turn back to the player.
            const parts = game.fen().split(' ');
            parts[1] = player;
            game.load(parts.join(' '));
            if (wantCollect.has(to)) st.collected.add(to);
            if (res.captured) {
                const capSq = res.flags && res.flags.includes('e') ? to[0] + from[1] : to;
                if (wantCapture.has(capSq)) st.captured.add(capSq);
            }
            st.selected = null;
            touch();
            if (checkDone(to, mover.type, res.promotion)) finish();
            return { ok: true, move: res, done: st.done, result: st.result };
        },
        undo() {
            const prev = st.undoStack.pop();
            if (!prev) return false;
            game.load(prev.fen);
            // Re-apply the extra-turn rule (loaded fen carries opponent turn).
            const parts = game.fen().split(' ');
            parts[1] = player;
            game.load(parts.join(' '));
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
const { loadProgress, saveProgress } = __req("storage");
const { bootFocusMode, applyFocusMode } = __req("focus");

const $ = (id) => document.getElementById(id);

let DATA = null;
let store = loadProgress();
let sess = null;
let board = null;
let pendingPromo = null;

const lang = () => (store.state.settings && store.state.settings.lang) || 'en';
const T = (obj, fb = '') => (obj && (obj[lang()] || obj.en)) || fb;
const inLearn = () => $('learn-screen') && $('learn-screen').classList.contains('active');
const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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

function starsOf(id) { return store.state.stars[id] || 0; }

/** Star burst on the picker button that just gained stars. */
function popStars(btn) {
    if (!btn || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    btn.classList.add('just-scored');
    setTimeout(() => btn.classList.remove('just-scored'), 900);
}

function renderPicker() {
    const pk = $('picker');
    if (!pk || !DATA) return;
    const groups = [];
    for (const lv of DATA.levels) {
        let g = groups.find((x) => x.name === (lv.group || 'misc'));
        if (!g) { g = { name: lv.group || 'misc', items: [] }; groups.push(g); }
        g.items.push(lv);
    }
    pk.innerHTML = groups.map((g, gi) =>
        `<div class="picker-group"><h2>${gi + 1}. ${esc(g.name)}</h2><div class="picker-row">` +
        g.items.map((lv, i) => {
            const n = starsOf(lv.id);
            // Stagger entrance per card; pure transform+opacity.
            const delay = Math.min(360, (gi * 4 + i) * 26);
            const cta = n ? (n === 3 ? 'Play again' : 'Improve') : 'Start';
            // Same three-part anatomy as a lesson card: header (title+meta),
            // body (the goal), footer (one CTA).
            return `<div class="lesson-card lvl-card${n ? ' solved' : ''}" style="animation-delay:${delay}ms">
                <div class="lesson-header">
                    <h3>${i + 1}. ${esc(T(lv.title))}</h3>
                    <div class="lesson-meta">
                        <span class="stars" aria-label="${n} of 3 stars">${starRow(n)}</span>
                        <span class="lvl-par">par ${lv.par}</span>
                    </div>
                </div>
                <div class="lesson-body"><p>${esc(T(lv.goalText))}</p></div>
                <div class="lesson-footer">
                    <button class="btn-primary lvl-open" data-lv="${esc(lv.id)}" type="button">${cta}</button>
                </div>
            </div>`;
        }).join('') + `</div></div>`
    ).join('');
    pk.querySelectorAll('[data-lv]').forEach((b) => b.addEventListener('click', () => openLevel(b.dataset.lv)));
}

function openLevel(id) {
    const lv = DATA.levels.find((l) => l.id === id);
    if (!lv) return;
    history.replaceState(null, '', 'index.html?level=' + id);
    showLearn();
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
    // Forced: on a freshly opened level the board does not hold focus yet, so
    // the first Tab must land on the piece the level expects.
    board.focusSquare(firstOwnSquare(), true);
}

function showPickerHome() {
    history.replaceState(null, '', 'index.html');
    showLearn();
    $('levelview').hidden = true;
    $('learn-heading').hidden = false;
    $('picker').hidden = false;
    renderPicker();
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

function pushLog(from, to, res) {
    const cap = res && res.captured ? 'x' : '-';
    const suf = res && res.promotion ? '=' + String(res.promotion).toUpperCase() : '';
    const label = `${from}${cap}${to}${suf}`;
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
            img.src = `assets/pieces/${p.color === 'w' ? 'white' : 'black'}-${PIECE_FILE[p.type]}.svg?v24`;
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
    pushLog(from, to, r.move);
    sess.state.lastMove = { from, to };
    sess.state.rover = to;
    const captured = !!(r.move && r.move.captured);
    paint();

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
        feedback('info', starsAfter === 0 ? 'Goal reached — one more move to finish.' : 'Keep going — follow the stars.');
    }
}
function collectedNow(sq) { return sess.state.collected.has(sq); }

function showResult(res) {
    const s = sess.state;
    const id = s.level.id;
    const gained = res.stars > (store.state.stars[id] || 0);
    if (gained) {
        store.state.stars[id] = res.stars;
        saveProgress(store.state, store.backend);
    }
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
    bind('nav-learn', () => {
        const id = new URLSearchParams(location.search).get('level');
        if (id && DATA && DATA.levels.some((l) => l.id === id)) openLevel(id);
        else showPickerHome();
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
    document.querySelectorAll('.nav-btn').forEach((b) => {
        if ((b.dataset.nav || '') === 'learn' || b.id === 'nav-learn') return;
        b.addEventListener('click', () => hideLearn());
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
    const id = new URLSearchParams(location.search).get('level');
    if (id && DATA.levels.some((l) => l.id === id)) { logMoves = []; renderLog(); openLevel(id); }
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
