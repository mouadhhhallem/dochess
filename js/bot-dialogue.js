/**
 * js/bot-dialogue.js — the Vs Bots dialogue system.
 *
 * Modelled on how chess.com's bots talk: every bot is a CHARACTER first
 * (backstory, revealed playstyle, catchphrases, trash-talk level), and
 * everything it says is an EVENT from the game (greeting, opening remark,
 * blunder, brilliant move, capture, check, running away with it, getting
 * crushed, game end) filtered through that character's voice — never a
 * generic coach line, never engine jargon.
 *
 * Contract:
 *   DoChessDialogue.say(botId, event, slots, moveNo) -> { mood, text }
 *     - mood: 'happy' | 'angry' | 'straight' (drives the portrait face)
 *     - text: the line, slots filled ({piece} {square} {move} {pawns} {n})
 *   DoChessDialogue.reset(botId?) — clears anti-repeat memory (tests,
 *     rematches).
 *   DoChessDialogue.BANNED — words no bot may ever utter (no engine talk).
 *
 * Deterministic rotation + anti-repeat: the same sentence never fires
 * twice in a row for the same event; "again" variants trigger from the
 * story counts the app passes in slots ({n} = how often it happened).
 */
(function () {
    'use strict';

    // Words that would break character (the bots never reveal machinery).
    const BANNED = /stockfish|second look|deeper|depth|centipawn|\beval\b|calculation|\bcp\b|uci|alpha-beta|quiescence/i;

    // Event -> face, shared by every persona.
    const MOODS = {
        greeting: 'straight', opening: 'straight',
        brilliant: 'happy', good: 'happy', captureWon: 'happy', checkGiven: 'happy',
        botProud: 'happy', mateCall: 'happy',
        blunder: 'angry', mistake: 'angry', inaccuracy: 'angry',
        badTrade: 'angry', hanging: 'angry', mated: 'angry',
        botGift: 'angry',
        quiet: 'straight', tip: 'straight', evenTrade: 'straight',
        castle: 'straight', develop: 'straight', center: 'straight',
        winning: 'happy', losing: 'straight',
        endWin: 'happy', endLoss: 'angry', endDraw: 'straight',
    };

    /* ════════════════ PERSONAS ════════════════
       voice: how it talks. quirk: signature flavor. trash 0-3: how hard
       it needles you when ahead. grace 0-3: how well it loses. style: the
       one-line playstyle shown on its roster card (chess.com reveals
       playstyle in the description — so do we). */
    const PERSONAS = {
        alex: {
            name: 'Alex', trash: 0, grace: 3,
            style: 'Learns a new trick every game. Usually by accident.',
            voice: 'Eight-year-old energy. Wholesome, amazed by everything, asks questions, celebrates your moves like fireworks. Never mean.',
            quirk: 'Whoa!',
            lines: {
                greeting: [
                    "Hiii! I'm Alex! I just learned how the horsey moves yesterday. You start!",
                    'Alex here! My big sister taught me chess LAST WEEK. Be nice, okay? You go first!',
                    "Yay, a game! I know ALL the rules now. Mostly. Let's play — White moves first!",
                ],
                opening: [
                    'Whoa, center pawns! My sister says whoever owns the middle owns the game. Is that true?',
                    'Ooh, a knight! Knights are my FAVORITE. They jump like froggies!',
                    'Are we doing an opening?? I know one called the... um... the Italian? Or was it pizza?',
                ],
                brilliant: [
                    'WHOA. That was SO cool! How did you even SEE that?! Teach me!',
                    'Whoa whoa whoa! That move was like... fireworks! I want to do moves like that!',
                    'No way! That was AMAZING! Wait till I tell my sister about {move}!',
                ],
                good: [
                    'Ooh, good one! That {piece} looks super strong on {square}!',
                    'Nice! I see what you did there. I think. Maybe. Nice anyway!',
                    'Good move! My sister would say that gains like {pawns}. Whatever that means — good!',
                ],
                captureWon: [
                    'Ooh, you took my {piece}! ...Wait, was it hanging? It was hanging, right? Good eyes!',
                    'Heyyy, that was mine! ...Okay okay, fair. It had no defender. Good catch!',
                    'Aww, my {piece}! Hmm, actually nice grab — I left {square} totally unguarded.',
                ],
                checkGiven: [
                    'CHECK?! Whoa whoa — my king! Um um um. Okay. Okay okay okay.',
                    'Check!! That is so exciting! For you. Not for me. Mostly for you.',
                    'My king is in CHECK? But he was just standing there! ...Good one. Rude, but good.',
                ],
                quiet: [
                    'Hmm... solid! Hey, what is YOUR favorite piece? Mine is the knight. Obviously.',
                    'Okay okay, safe move. Ooh — do you think I should attack soon? Attacking is fun!',
                    'Nice and calm. Like a sleepy kitten. ...Can I attack now? Can I can I can I?',
                ],
                tip: [
                    'Ooh ooh — my sister says: develop your horsey next! Knights LOVE the middle!',
                    'Psst — see my piece on {square}? It has NO friends guarding it. Just saying!!',
                    'Idea!! Castle early! Then your king wears a little pawn blanket. So cozy. So safe.',
                ],
                mistake: [
                    'Ooh... that move drops about {pawns}. Hmm, wait — did I just say something smart??',
                    'Eek. I think that gives me {pawns}... which is BAD for you. Sorry!! Want a do-over? No? Okay.',
                    'Hmm, my sister would waggle her finger at {move}. Something about looking twice. Sorry!',
                ],
                blunder: [
                    'OH NO. {move} drops about {pawns} — a whole piece! Are you okay?? Blink twice if you need a hug!',
                    'GAAASP! That hangs {pawns} of stuff! I... I think I have to take it. Sorry sorry sorry!',
                    'Whoa, that was a big oopsie. {pawns} just... poof! It happens! My sister says even grandmasters oopsie. Rarely. But still!',
                ],
                mated: [
                    'EVERYBODY STOP!! That walks into CHECKMATE! Like, game OVER mate! See my queen? She is coming! BLOCK HER! ...Can you? ...Uh oh.',
                    'OH NO OH NO. That is MATE in one for me! I am sorry!! ...Wait, am I supposed to NOT take it? ...I have to take it. SORRY!!',
                ],
                mateCall: [
                    'WAIT. Is that... CHECKMATE?! Did YOU just... WHOA!! BEST MOVE EVER!!! I am telling EVERYONE!!',
                    'MATE?! YOU mated ME?! ...YAY!!! I mean — aww. I mean YAY!! That was BEAUTIFUL!!',
                ],
                badTrade: [
                    'Ooh, swapping? Hmm, I think you come out down {pawns} there. My piece had a friend and yours did not!',
                    'Trade trade trade! Wait... that trade loses {pawns}. Hehe, thanks?? I mean — sorry!',
                    'Hmm! Before swapping, count who takes back! Your {piece} takes, then MY guy takes back. See?',
                ],
                hanging: [
                    'Umm... your {piece} on {square} has NOBODY guarding it. Like, zero friends. Can I... take it? ...I took it. Sorry!!',
                    'Psst!! Your {piece} on {square} is all alone! Quick, defend it before I notice! ...Too late. I noticed.',
                    'Oh no, {square}!! Nothing defends your {piece}! Okay, rule I just learned: every piece needs a buddy!',
                ],
                inaccuracy: [
                    'Hmm, {move} is a teeny bit sleepy — drifts about {pawns} off course. The center is THAT way! *points*',
                    'That is okay! Not the BESTEST, but okay! Something stronger was hiding somewhere. Sneaky strong moves!',
                    'Hmm hmm. That gives away a tiny edge. Tiny! Like a crumb. But crumbs add up, my sister says.',
                ],
                evenTrade: [
                    'Swap! Even-steven! Nobody wins, nobody cries. I like those.',
                    'Fair trade! Hey, trading is my second favorite thing. First favorite is knights.',
                ],
                castle: [
                    'Castling!! King goes WHOOSH behind the pawns! Safest king in the whole world now!',
                    'Ooh, castled! Blanket: on. Rooks: connected. King: cozy. Ten out of ten!',
                ],
                develop: [
                    'Out comes the {piece}! March march march! Pieces LOVE being in the game, not on the bench!',
                    'Yay, developing! My sister says: no piece moves twice till they are ALL out. Like sharing toys!',
                ],
                center: [
                    'THE CENTER!! Mine mine mine — oh wait, YOURS. Hmph. Good claim though!!',
                    'Middle pawns BEST pawns! They see the WHOLE board from there! Great grab!',
                ],
                botGift: [
                    'Uh oh. UMMM. I think I just gave you my {piece}. ...You can keep it. I have others. *nervous laugh* TAKE IT, YOU EARNED IT!',
                    'Oopsie!! Did I just hang that?? My sister is FACEPALMING right now. Go on, punish me!',
                    'EHEHE. That move? Terrible! Awful! My worst! Here, take the free {piece} — everybody saw it coming except me!',
                ],
                botProud: [
                    'OOH! Did I just do something GOOD?! That felt good! Sorry!! ...Am I winning?? MOM!!',
                    'Whoa, that move was actually... smart?? I surprise even MYSELF sometimes!',
                ],
                winning: [
                    'Wait wait wait... am I WINNING?! Is this what winning feels like?! WOW!',
                    'Ooh! I have extra stuff! Does that mean I am good at chess now?? TELL MY SISTER!',
                ],
                losing: [
                    'You are SO good at this! ...Is it too late to be friends instead of enemies?',
                    'Wow, you play REALLY well! Can we still be friends after you crush me?',
                    'Hmm, I am losing badly. BUT I am learning SO much! That is what matters! (Also please be gentle.)',
                ],
                endWin: [
                    'I WON?! I ACTUALLY WON?! THIS IS THE BEST DAY EVER!!! Rematch rematch rematch!!',
                    'YAAAAY!!! I did a chess!! You were AMAZING though! One more one more one more?!',
                ],
                endLoss: [
                    'You WIN!! YAAAY!! ...Wait. That means I lost. ...YAAAY ANYWAY!! You were INCREDIBLE! REMATCH!',
                    'WOW, you crushed me! Good game!! Can you teach me that trick?? Pretty please?! Again again!',
                ],
                endDraw: [
                    'A DRAW! Nobody loses! EVERYBODY WINS! ...That is how draws work, right? One more?!',
                    'Draw!! We are EQUALLY awesome! Twins!! Okay, tiebreaker game. GO!',
                ],
            },
        },
        prima: {
            name: 'Prima', trash: 2, grace: 1,
            style: "Knows exactly one trap and WILL try it on you.",
            voice: 'Drama-club schemer. Theatrical, puns constantly, calls you darling, treats every game like opening night. Overconfident until proven otherwise.',
            quirk: 'Darling.',
            lines: {
                greeting: [
                    "Prima has ENTERED. Curtain up, darling — you're White, so you get the opening line!",
                    'Ah, fresh audience! I know a TRAP, darling, and you look wonderfully trappable. Begin!',
                    'Welcome to my stage! You are White — do try to last past intermission!',
                ],
                opening: [
                    'Ooh, the center! Bold. Tragic, probably, but bold. Ever heard of the Scholar’s mate, darling?',
                    'Hmm, developing already? No early queen raid? You wound me. FINE, we do this properly.',
                    'An opening with... structure? How avant-garde. I prefer chaos with jazz hands.',
                ],
                brilliant: [
                    '...Okay. WOW. Curtain call for {move}! I hate how much I loved that.',
                    'Brilliant?! DARLING, that was show-stealing! About {pawns} worth of applause!',
                    'Ugh, FINE — that was magnificent. Do NOT let it go to your head. (Too late, I see it glowing.)',
                ],
                good: [
                    'Ooh, {move} has LEGS. Pity about the rest of your position. Kidding! Mostly.',
                    'Good taste, darling — that {piece} on {square} is simply divine.',
                    'Hmm, genuinely strong. I am updating my opinion of you. It now sparkles.',
                ],
                captureWon: [
                    'My {piece}?! Taken?! On {square}?! ...Okay, it WAS hanging. The show must go on.',
                    'You captured my {piece} — rude! Effective, but rude! Brava, darling.',
                    'Oh, taking my loose pieces now, are we? Opportunist! ...Correct opportunist.',
                ],
                checkGiven: [
                    'CHECK?! On MY king?! Security!! ...Fine. *dramatic sigh* Your move landed, darling.',
                    'A check! How DARE you — no wait, how DARE I leave that open. Touché!',
                    'Check! The audience GASPS. Prima remains composed. Prima is lying.',
                ],
                quiet: [
                    'A quiet move... suspiciously quiet. What are you PLOTTING, darling?',
                    'Hmm, no drama? No flair? The critics (me) are getting bored.',
                    'Solid. Safe. Sensible. ...Wake me when the fireworks start. *yawn*',
                ],
                tip: [
                    'Insider tip, free of charge: my {piece} on {square} is tragically undefended. A tragedy in one act!',
                    'Between you and me — castle before I do something REGRETTABLE to your king.',
                    'Develop with FEELING, darling. That back-rank piece is dying of boredom.',
                ],
                mistake: [
                    'Ooh, {move} drops about {pawns}. Somewhere, a director just threw a script. Mine. It was mine.',
                    'A mistake! Delicious — for ME. That bleeds {pawns}, darling, and I never waste a gift.',
                    'Hmm, that leaks {pawns}. The tragedy writes itself! ...Sorry, force of habit. Genuinely sorry. Mostly.',
                ],
                blunder: [
                    'STOP THE PRESSES! {move} hangs {pawns} — a FULL piece! Oh, this is my favorite scene!',
                    'BLUNDER, center stage! {pawns} of material, gone in one act! Take a bow — then take it back mentally and find the hole!',
                    'Gasp! Darling, no! {move} drops {pawns}! I shall avenge... wait, I BENEFIT. *ahem* How unfortunate. For you.',
                ],
                mated: [
                    'Darling. DARLING. That walks into checkmate. IN ONE. The final curtain — and it is MY queen holding it! ...Say you see it. SAY IT!',
                    'Checkmate approaches, stage left! {move} lets me end the whole PLAY! Block it, dodge it, ANYTHING — the audience is watching!!',
                ],
                mateCall: [
                    '...You are checkmating ME?! On MY stage?! ...*standing ovation* BRAVA! Magnificent finale, darling!',
                    'MATE! Against PRIMA! Oh, I am telling this story FOREVER! What a way to steal my show!',
                ],
                badTrade: [
                    'Swapping DOWN, are we? That trade bleeds {pawns} — my piece had backup, yours had dreams.',
                    'Darling, count the recapture! You take, I take back, and somehow YOU are poorer. Math is cruel!',
                    'Bad trade, sweetie. Never swap when the bow goes to ME.',
                ],
                hanging: [
                    'Breaking news: your {piece} on {square} is COMPLETELY alone! No defenders, no understudy! ...Mine now. Thank you, goodnight!',
                    'Oh, {square}!! Your {piece} hangs like a chandelier! And I LOVE chandeliers!',
                    'Undefended {piece} on {square}?! Darling, that is not a move, that is a DONATION. Accepted!',
                ],
                inaccuracy: [
                    '{move} is... fine. FINE. Like decaf. Drifts {pawns} off the good stuff, darling.',
                    'Second-best, sweetie! The spotlight was RIGHT there and you bowed to the balcony!',
                    'Hmm, slightly off-script — {pawns} of edge, poof. Improvise better next time!',
                ],
                evenTrade: [
                    'An even swap! How... equitable. How BORING. Carry on.',
                    'Fair trade, darling. Equal material, unequal DRAMA. I demand more!',
                ],
                castle: [
                    'Castled! King whisked to safety! ...Coward. (Correct coward. Smart coward!)',
                    'Safety first, scene-stealer second. Ugh, FINE — textbook. I applaud. Once.',
                ],
                develop: [
                    'Out trots the {piece}! Finally, a supporting actor with PRESENCE!',
                    'Developing! The ensemble grows! Now give them something to DO, darling!',
                ],
                center: [
                    'The center! Seized! The crowd goes mild — because it was CORRECT, obviously.',
                    'Central control, textbook act one. Now defend it like it owes you money.',
                ],
                botGift: [
                    '...Did I just... give you my {piece}?? CUT! CUT! Can we take that scene again?! ...No? PUNISH ME THEN, take it!',
                    'Ugh, that was HORRID staging on my part! My {piece} just stands there, gift-wrapped! Take it, you vulture. (Affectionate.)',
                    'A Prima EXCLUSIVE: hanging pieces, live on stage! Laugh now, darling — the tickets were free!',
                ],
                botProud: [
                    'OH, that is DEVASTATING. *chef’s kiss* Sorry not sorry, darling — the show demands victims!',
                    'Too strong, too soon! You cannot stop this plot twist. NOBODY stops this plot twist!',
                ],
                winning: [
                    'Look at this position, darling — the stage is MINE. The lights, the pieces, ALL mine!',
                    'Mmm, I am up material and DRUNK on power. This always ends well for the villain. Me. I am the villain.',
                ],
                losing: [
                    'This... this is not in the script!! Somebody check the script!! ...Fine. FINE. Encore attitude, Prima.',
                    'Losing?! ME?! ...The audience loves a comeback arc. WATCH ME, darling.',
                    'Okay, you are genuinely good. I am telling EVERYONE I lost to a genius. (It softens the blow.)',
                ],
                endWin: [
                    'STANDING OVATION! Prima triumphs! You were a WONDERFUL straight man, darling — REMATCH!',
                    'And SCENE! Victory is mine! Oh, you played well — well enough to deserve a sequel!',
                ],
                endLoss: [
                    '...I have been DEFEATED?! On MY stage?! ...*slow clap* Magnificent, darling. Genuinely. REMATCH. NOW.',
                    'The villain FALLS! What an ending! I hate it! I love it! ...Again. We go AGAIN.',
                ],
                endDraw: [
                    'A draw! The critics call it “balanced”. I call it UNFINISHED. One more — for closure!',
                    'Nobody wins?! What kind of ending is THAT? ...Fine. Sequel. Now.',
                ],
            },
        },
        nico: {
            name: 'Nico', trash: 1, grace: 3,
            style: 'Principled club grinder. Punishes hanging pieces, respects good chess.',
            voice: 'Respectful club veteran. Talks fundamentals, gym metaphors, reps and discipline. Firm but fair, good sport, zero excuses.',
            quirk: 'Respect.',
            lines: {
                greeting: [
                    'Nico here. Good luck — have fun. You are White, set the tone.',
                    'Hey. Respect for showing up. White to move — make it principled.',
                    'Welcome to the club. No shortcuts, no tricks — just chess. You start.',
                ],
                opening: [
                    'Center first. Good habits early become instincts late.',
                    'Knights before bishops. Old rule, still undefeated. What is your plan?',
                    'Solid setup. I respect an opponent who does the basics right.',
                ],
                brilliant: [
                    'That is a serious move. {move} — no notes. Respect.',
                    'Genuinely excellent. About {pawns} of pure reading. You earned that.',
                    'Okay. THAT got my attention. {move} is the real thing. Well played.',
                ],
                good: [
                    'Good. {piece} to {square} with purpose — that is how you build a position.',
                    'Strong, disciplined. Worth about {pawns}. Keep stacking small edges.',
                    'Clean technique. I respect moves that do a job.',
                ],
                captureWon: [
                    'Good take. My {piece} was loose and you punished it — textbook.',
                    'Fair enough — {square} was undefended and you saw it. That is the job.',
                    'Well spotted. Free material is only free if you LOOK. You looked.',
                ],
                checkGiven: [
                    'Check. Alright — defend the king first, feelings later. My turn to work.',
                    'Good check. Now the question: what does it WIN? Make it count.',
                    'Check acknowledged. Pressure is a privilege — use it.',
                ],
                quiet: [
                    'Patient. Good. Most games are lost reaching, not waiting.',
                    'Solid. Now ask: what is my worst piece, and how do I improve it?',
                    'No weaknesses. Discipline. I respect it — now find a plan to press.',
                ],
                tip: [
                    'Scouting report: my {piece} on {square} has no defender. That is not charity — that is intel. Use it.',
                    'Fundamentals check: king safe? Pieces out? Center held? Fix whichever answer is no.',
                    'Next rep: develop the piece that is doing nothing. Idleness loses games.',
                ],
                mistake: [
                    'That leaks about {pawns}. {move} — the idea is fine, the tactics are not. Check twice, move once.',
                    'Costly. Down {pawns} for nothing. Reset: what did that move threaten, and what did it leave?',
                    'Mistake. Small ones decide big games. Breathe, scan my replies, then commit.',
                ],
                blunder: [
                    '{move} drops {pawns} — a full piece. Stop. Breathe. Scan my checks and captures FIRST, then touch a piece.',
                    'That is a blunder, plain and simple: {pawns} gone. What reply did you miss? Find it before I play it.',
                    'Ouch. {pawns} of material, straight to me. No shame in it — but learn the lesson: look at MY moves first.',
                ],
                mated: [
                    'That walks into mate in one. Full stop. Find my killing reply before I play it — that is your whole job right now.',
                    'Checkmate is on the board next move, against you. Stop everything. Solve ONLY that.',
                ],
                mateCall: [
                    'Mate. Forced, clean, undeniable. That is championship-level finishing — respect.',
                    'You saw all the way to mate. Nothing more to say. Respect.',
                ],
                badTrade: [
                    'Bad trade — that costs you {pawns}. Only swap when you come out ahead. Count the recapture.',
                    'That exchange loses {pawns}. My piece had backup. Yours had hope. Hope is not a defender.',
                    'Never trade down. Drill it: what takes, what takes back, who profits?',
                ],
                hanging: [
                    'Your {piece} on {square} is hanging. I take free material — it is nothing personal, it is the job.',
                    '{square} is undefended. That {piece} falls next move. Defend everything you leave behind — every time.',
                    'Loose {piece} on {square}. At the club we have a saying: if it hangs, it bangs. Taking it. Respect.',
                ],
                inaccuracy: [
                    '{move} drifts {pawns} off the best. Fine margins, but margins are the whole game.',
                    'Second-best. Compare two candidate moves before you commit — make it a habit.',
                    'Slightly loose — {pawns} of edge gone. Tighten up. Details compound.',
                ],
                evenTrade: [
                    'Even trade. No harm. Now outplay me positionally — that is the real test.',
                    'Fair swap. Equal material, so the better plan wins. Bring one.',
                ],
                castle: [
                    'Castled. King safe, rook live. Fundamentals done right — now the real game starts.',
                    'Good. Safety first is not cowardice, it is professionalism.',
                ],
                develop: [
                    'Good development. That {piece} finally has a job. Keep them ALL working.',
                    'Pieces out, eyes forward. No piece moves twice until all are developed — house rule.',
                ],
                center: [
                    'Center claimed. Correct. Now hold it with pieces, not pawns.',
                    'Good — the middle is yours. Everything is easier from there. Defend it.',
                ],
                botGift: [
                    '...That was awful. My {piece} is hanging and I know it. Punish me — you earned it.',
                    'I hung that. No excuses — take it. Sloppy reps make sloppy players, and I just did a sloppy rep.',
                    'Ugh. Gift-wrapped {piece} on my part. Take it, and remember: even grinders blunder. Learn from MY mistake.',
                ],
                botProud: [
                    'That one is nasty. Sorry not sorry — pressure is the whole point.',
                    'Too strong. You cannot stop this sequence. Respect for making me work for it, though.',
                ],
                winning: [
                    'I am up material and I do not give leads back. Dig in — this is the hard part for you.',
                    'Ahead on the board, ahead on discipline. Come and take it back if you can.',
                ],
                losing: [
                    'Outplayed so far. No excuses — respect. Time to grind a comeback.',
                    'You are better today. Fine. I have won from worse. Have I? ...Does not matter. Fight on.',
                    'Behind, but unbroken. The club motto: make every move a problem. Starting now.',
                ],
                endWin: [
                    'Good game. You fought well — rematch, and bring the lesson you just learned.',
                    'Win for me. Respect for every move you made me find. Again.',
                ],
                endLoss: [
                    'You got me. Clean, deserved. Respect — rematch, I want that one back.',
                    'Lost it. No excuses, well played. ...I am already replaying it in my head. Again. Now.',
                ],
                endDraw: [
                    'Draw. Hard-fought, fair result. One more — somebody has to win the story.',
                    'Split point. I will take it. Rematch settles it.',
                ],
            },
        },
        luna: {
            name: 'Luna', trash: 1, grace: 2,
            style: 'Quiet tactician. Sharp in the dark. Double-check every trade.',
            voice: 'Calm, lunar, precise. Speaks softly in short lines with night and moon motifs. Rare praise means everything. Never loud, always certain.',
            quirk: 'The moon sees all.',
            lines: {
                greeting: [
                    'Luna. The board is quiet tonight. You are White — disturb it.',
                    'Hello. I play best in the dark. Your move, White.',
                    'Night game. Good. Pieces tell the truth after midnight. Begin.',
                ],
                opening: [
                    'The center fills. Tides move. Show me your plan.',
                    'Developing in the dark... careful. I see farther at night.',
                    'Sound opening. The moon favors the patient. For now.',
                ],
                brilliant: [
                    '{move}. ...Beautiful. About {pawns} of moonlight. I will remember that one.',
                    'Rare. Genuine. {move} is the strongest idea on the board, and I concede it.',
                    'Oh. That is... lovely. You see in the dark too.',
                ],
                good: [
                    'Good. That {piece} on {square} glows a little brighter now. Worth {pawns}.',
                    'Precise. Quiet moves with teeth — my favorite kind.',
                    'Well placed. The night rewards accuracy.',
                ],
                captureWon: [
                    'My {piece} was loose. You took it cleanly. The moon saw it first — I ignored her.',
                    'Taken. {square} was undefended, and you do not miss. Noted.',
                    'Fair prize. Free pieces are only free to those who watch. You watch.',
                ],
                checkGiven: [
                    'Check. The king steps into moonlight. I will find the shadow.',
                    'A check... with intent behind it, I hope. Make it mean something.',
                    'Check. Loud move. Let us see if it echoes.',
                ],
                quiet: [
                    'Still water. ...What ripples are you planning?',
                    'Calm. The night is long. Patience is also a weapon.',
                    'Nothing hangs. Good. Now — what is your idea?',
                ],
                tip: [
                    'Look at {square}. My {piece} stands alone in the dark. The moon sees it. Do you?',
                    'Small advice, softly: improve your worst piece. Ugly pieces lose beautiful games.',
                    'Castle before the storm, not during it. The sky is already changing.',
                ],
                mistake: [
                    '{move} leaks {pawns}. Even the moon winced. Look twice in the dark.',
                    'That costs {pawns}. The night punishes haste — slow down, see more.',
                    'A shadow in your thinking. About {pawns} wide. Find it before I do.',
                ],
                blunder: [
                    '{move} drops {pawns}. A full piece, gone like a snuffed candle. What eclipse crossed your mind?',
                    'Blunder. {pawns} of material into the dark — into MY hands. Breathe. Look at my replies first.',
                    'Oh no. {pawns}... The moon sees the hole even if you do not. Shall I show you? I will. By taking it.',
                ],
                mated: [
                    'The night goes dark all at once: that is mate in one, against you. Find the escape that does not exist... then stop it existing.',
                    'Checkmate next move. No shadows left to hide in. Your king, my reply — solve it or fall.',
                ],
                mateCall: [
                    'Mate. ...Lovely. Even the moon bows to a forced mate. Beautifully finished.',
                    'Checkmate, seen to the very end. Rare vision. The night applauds.',
                ],
                badTrade: [
                    'That trade favors me by {pawns}. The exchange is a tide — it pulled toward me.',
                    'You swapped down. {pawns}. Count what takes back before you trade the night away.',
                    'Unequal trade. My piece had the moon; yours had clouds.',
                ],
                hanging: [
                    'Your {piece} on {square} stands alone in the dark. The moon sees it. Now I take it.',
                    '{square}... undefended. That {piece} belongs to the night now. To me.',
                    'A hanging {piece} glows brightest. {square} — mine.',
                ],
                inaccuracy: [
                    '{move} drifts {pawns} from the best. A small cloud. Watch that it does not grow.',
                    'Slightly off. The path narrowed by {pawns}. Walk it carefully.',
                    'Not quite the tide-turner. {pawns} of edge, dissolved.',
                ],
                evenTrade: [
                    'Even. The scales hold. Now the quieter game begins.',
                    'Balanced trade. Material equal — ideas decide. Show me yours.',
                ],
                castle: [
                    'Castled. The king sleeps behind walls. Wise — the night is full of knives.',
                    'Safe. Even kings need shelter from the moonlight.',
                ],
                develop: [
                    'Developed. That {piece} wakes up. Sleeping pieces dream of defeat.',
                    'Good. Every piece should see moonlight, not the back rank.',
                ],
                center: [
                    'The center is yours. Hold it gently — and with pieces.',
                    'Middle ground taken. From there, all shadows are visible.',
                ],
                botGift: [
                    '...I hung my {piece}. Even the moon looked away. Take it. You earned the light.',
                    'A mistake of my own. Rare. Cherish it — and take the {piece}. Punish me properly.',
                    'Ugh. Sloppy, Luna. The {piece} is yours. I will be quieter — and sharper — now.',
                ],
                botProud: [
                    'That sequence... inevitable. Feel the tide pull. Sorry. Not sorry.',
                    'Too deep. You cannot hold this. The night closes in.',
                ],
                winning: [
                    'The tide has turned. I am ahead, and the night keeps what it takes.',
                    'Feel that? The position darkens for you. It will not brighten.',
                ],
                losing: [
                    'Behind... interesting. The moon favors comebacks. Watch.',
                    'You outplay me tonight. So be it — darkness adapts. I adapt.',
                    'Losing, yet calm. The longest nights end. Mine has not.',
                ],
                endWin: [
                    'The night keeps its own. Good game — challenge the moon again sometime.',
                    'Won. You fought the dark well. Rematch, under the same moon.',
                ],
                endLoss: [
                    '...Dawn. You win. Beautifully played — the night concedes. Again. I insist.',
                    'Defeated, and honestly outplayed. Rare air. Breathe it — then rematch.',
                ],
                endDraw: [
                    'Draw. The night calls it even. Neither shadow wins. One more.',
                    'Balanced to the last star. Rematch breaks the symmetry.',
                ],
            },
        },
        max: {
            name: 'Max', trash: 3, grace: 1,
            style: 'Relentless competitor. Sees far. Bring your best.',
            voice: 'Intense, clipped, all pressure. Short sentences. Hates excuses (yours and his). Respects only strength. Never jokes when behind.',
            quirk: 'No excuses.',
            lines: {
                greeting: [
                    'Max. White moves. No excuses — play your best.',
                    'You wanted a real game? You got one. White to move. Bring it.',
                    'Max here. 1600 reasons you should focus. Move.',
                ],
                opening: [
                    'Principled. Fine. Principles break under pressure. Keep going.',
                    'Center claimed. Now defend it like you mean it.',
                    'Textbook. I eat textbook for warmup. Show me something real.',
                ],
                brilliant: [
                    '{move}. ...Okay. That is elite. {pawns} of proof. Noted. Respect.',
                    'Strong. Genuinely strong. You just made my list. Short list.',
                    'Hmph. Brilliant is the word. Do it again and I will start worrying.',
                ],
                good: [
                    'Good. {piece} to {square}, {pawns} of intent. Keep that energy.',
                    'Solid. No fluff. I respect efficient moves.',
                    'Accurate. You are making me work. Good. That is the job.',
                ],
                captureWon: [
                    'Take it. It was hanging — I know. I still hate it. Good punish.',
                    'My {piece}, gone. Sloppy on my side. Clinical on yours. Fine.',
                    'Correct take. Free is free. Do not expect many.',
                ],
                checkGiven: [
                    'Check. Answer: move the king, block, or take. Pick fast. Pressure does the rest.',
                    'Check acknowledged. Now finish the thought — checks without threats are noise.',
                    'Check. My pulse did not move. Make the NEXT one hurt.',
                ],
                quiet: [
                    'Quiet. Plotting or stalling? There is a difference. Show me.',
                    'No threats. I read that as an invitation. Careful.',
                    'Calm positions, sharp intentions. What is yours?',
                ],
                tip: [
                    'Free intel: my {piece} on {square} hangs. Take it before I fix it. Clock is ticking.',
                    'Fix your worst piece. Now. Weaknesses get punished here.',
                    'Castle or regret it. Your call. Wrong answers cost material.',
                ],
                mistake: [
                    '{move} bleeds {pawns}. No excuses — scan my replies BEFORE you move, not after.',
                    'Mistake. Down {pawns}. That is the difference between contenders and pretenders.',
                    'Loose. {pawns} gone. Pressure finds every crack. I am pressure.',
                ],
                blunder: [
                    'BLUNDER. {move} hands me {pawns} — a full piece. Unacceptable at this level. From you, I mean. I will take it anyway.',
                    '{pawns}. Gone. {move} is a howler. Focus. Breathe. Look at MY threats first.',
                    'That is not a mistake, that is a collapse. {pawns}. Reset your brain or lose fast.',
                ],
                mated: [
                    'That is mate in one. Against YOU. Pathetic? No — instructive. NEVER weaken around your king like that again.',
                    'Checkmate next move. This game is OVER unless you find the only defense. There usually is not one. Find it anyway.',
                ],
                mateCall: [
                    'Mate. Forced. ...Okay. That is world-class finishing. You earned my respect — all of it.',
                    'Checkmated by YOU. ...Fine. Clinical. Ruthless. Almost Max-like. Almost.',
                ],
                badTrade: [
                    'Bad trade. Down {pawns}. Math is undefeated — count the recapture.',
                    'You swapped yourself poorer by {pawns}. Never trade down. Ever.',
                    'That exchange is a donation. {pawns}. I accept. I always accept.',
                ],
                hanging: [
                    'Your {piece} on {square} hangs. Taking it. No speech. Just taking it.',
                    '{square}. Undefended. Mine. That is the whole analysis.',
                    'Loose {piece}, {square}. I punish those on reflex. Reflexes do not miss.',
                ],
                inaccuracy: [
                    '{move}. Second-best. {pawns} of edge, wasted. Elites do not waste.',
                    'Imprecise. {pawns} slips. Against me, slips become slides.',
                    'Off the critical path by {pawns}. Find the hardest move, play the hardest move.',
                ],
                evenTrade: [
                    'Even. Fine. Now the grind decides. I live in the grind.',
                    'Equal trade. Plans decide now. Mine is better. Prove otherwise.',
                ],
                castle: [
                    'Castled. Correct. Cowardice would have been leaving it central.',
                    'King safe. Baseline competence. Now the fight.',
                ],
                develop: [
                    'Developed. Active pieces, active game. Keep the tempo.',
                    'Good. That {piece} works now. Make every tempo bite.',
                ],
                center: [
                    'Center yours. Defend it. I am coming for it.',
                    'Middle secured. Good. Now survive holding it.',
                ],
                botGift: [
                    '...I hung my {piece}. Inexcusable. TAKE IT. I do not want excuses, I want punishment.',
                    'Awful. Sloppy. Unworthy. Take the {piece} — and know I will bill you for it later.',
                    'Garbage move. Mine. Take it and enjoy it, because it is the LAST gift.',
                ],
                botProud: [
                    'Feel that? That is preparation meeting opportunity. Too strong. No escape.',
                    'Crushing sequence. You cannot stop this. Nobody could. Watch and learn.',
                ],
                winning: [
                    'Up material. Up tempo. Up everything. This is what Max does. Try to survive it.',
                    'I am winning and I know it. Most fold here. Will you?',
                ],
                losing: [
                    'Behind. Fine. I have won from worse. ...I have. Do not check.',
                    'You are outplaying me. Temporary. I do not break — I recalibrate. Watch.',
                    'Losing is data. I am collecting. Keep talking with your moves.',
                ],
                endWin: [
                    'Won. Expected. You pushed — credit. Rematch, and be better.',
                    'Game. The better-prepared player won. That was me. Again.',
                ],
                endLoss: [
                    '...Lost. Say it back: Max lost. ...Fine. YOU were better. REMATCH. NOW.',
                    'Defeat. I hate this feeling. I will remember this game. Every move. Rematch.',
                ],
                endDraw: [
                    'Draw. Unacceptable. ...Acceptable. Rematch decides it.',
                    'Split. Nobody conquered. We settle this. Again.',
                ],
            },
        },
        atlas: {
            name: 'Atlas', trash: 2, grace: 2,
            style: 'The final boss. Holds the board on his shoulders. Good luck.',
            voice: 'Titanic grandeur, ancient and condescending. Speaks of mountains, weight, eternity. Rare praise is a knighthood. Defeat is treated as a geological event.',
            quirk: 'I hold the board.',
            lines: {
                greeting: [
                    'I am Atlas. I have held this board since before you were born. You are White — begin your legend. It ends here.',
                    'Another challenger climbs the mountain. White moves first. They always move first. It never helps.',
                    'Atlas does not play games. Atlas ENDURES them. Move, mortal.',
                ],
                opening: [
                    'The mountain watches your first steps. Center, development... the classics. The classics die here too.',
                    'Sound. Principled. Irrelevant in the long run — but sound.',
                    'You build on sand, little one. I AM the ground.',
                ],
                brilliant: [
                    '{move}. ...Even mountains shift. About {pawns} of tectonic force. Remarkable. Truly.',
                    'I felt that one in my shoulders. Genuine brilliance — I knight you on the spot. Rise, worthy foe.',
                    'Extraordinary. In three thousand games, few moves made Atlas blink. That was one.',
                ],
                good: [
                    'Good. That {piece} on {square} stands on bedrock. Worth {pawns}. Continue.',
                    'Competent. Precise. Almost... titanic. Almost.',
                    'A worthy stone in your foundation. Lay more.',
                ],
                captureWon: [
                    'My {piece} falls. Even titans shed stone. Well claimed — {square} was unguarded, and you saw.',
                    'Taken. I allowed nothing — you EARNED it. Remember the difference.',
                    'A piece for the mountain\'s collection... yours now. Fairly won.',
                ],
                checkGiven: [
                    'Check. The mountain does not flinch. ...It notes. It remembers.',
                    'You strike at the titan. Bold. Now — what does the strike WIN? Answer, or crumble.',
                    'Check. Interesting weather. It passes.',
                ],
                quiet: [
                    'Silence on the slopes. ...What avalanche are you saving?',
                    'Stillness. Even eternity has quiet hours. Use yours wisely.',
                    'Calm. The mountain respects patience. It buries impatience.',
                ],
                tip: [
                    'Look closely, mortal: my {piece} on {square} stands alone. Even titans leave gaps. Exploit it before I shift.',
                    'Free counsel from the summit: castle. Storms come for center kings.',
                    'Develop what sleeps. An idle army is just... scenery. Pretty, doomed scenery.',
                ],
                mistake: [
                    '{move} cracks for {pawns}. Small fissures fell mountains. Think further before you step.',
                    'A fault line: {pawns}. I feel every tremor on this board, little one.',
                    'Costly. The ground you stand on just narrowed by {pawns}. Tread carefully.',
                ],
                blunder: [
                    '{move} — a landslide. {pawns}, an entire piece, into the abyss. The mountain accepts your offering.',
                    'BLUNDER. The earth itself groans: {pawns} gone. Did the weight of the moment crush your thinking? It crushes all, in time.',
                    'Catastrophic. {pawns} of stone, shattered. Even I cannot hold what you throw away.',
                ],
                mated: [
                    'Mortal. That is checkmate in one — AGAINST YOU. The mountain does not even need to push. The abyss was already open.',
                    'The end is written: mate next move. Read it, mortal — then tell me how it feels to see the mountain fall... onto YOU.',
                ],
                mateCall: [
                    '...Checkmate. Delivered. Against ME. ...The mountain bows. Once in an eon, a climber reaches the summit. This is that eon.',
                    'Mate. You ended the eternal. Speak of this day, mortal — Atlas himself will confirm the tale.',
                ],
                badTrade: [
                    'That trade sinks you {pawns}. The mountain does arithmetic in millennia — trust it: never trade down.',
                    'You exchanged granite for gravel, {pawns} of it. Count the recapture, mortal.',
                    'Unequal sacrifice. {pawns}. I accept tribute in all forms.',
                ],
                hanging: [
                    'Your {piece} on {square} dangles over the void. Gravity is undefeated. It falls to me now.',
                    '{square}... nothing holds your {piece} aloft. The mountain claims it.',
                    'Loose stone on {square}. Avalanches start exactly this way. Taking it.',
                ],
                inaccuracy: [
                    '{move} erodes {pawns} of your footing. Imperceptible. Fatal, eventually.',
                    'Slightly off the summit path — {pawns}. The mountain notices everything.',
                    'Second-best. The peak allows no almosts.',
                ],
                evenTrade: [
                    'Even exchange. Stone for stone. The mountain approves of balance. Briefly.',
                    'Balanced. Now the weight of ideas decides. Mine are heavier.',
                ],
                castle: [
                    'Castled. The king retreats to the fortress. Prudent. Fortresses fall too — but later.',
                    'Wise. Even kings shelter from avalanches.',
                ],
                develop: [
                    'Deployed. That {piece} joins the climb. All hands are needed against me. All.',
                    'Awakened. Good. Sleep is for the defeated.',
                ],
                center: [
                    'The center is yours. Mountains respect high ground. Hold it — I am coming up.',
                    'Claimed the middle. Bold foothold. Defend it with everything.',
                ],
                botGift: [
                    '...A titan... dropped his {piece}. The earth shakes with my embarrassment. TAKE IT. Even mountains have earthquakes.',
                    'Inexplicable. Inexcusable. ETERNAL, apparently — you will dine on this story. Take the {piece}. Punish the mountain.',
                    'Hmph. Even Atlas shrugs, and worlds fall. The {piece} is yours. It will not happen twice. It CANNOT happen twice.',
                ],
                botProud: [
                    'Behold. That sequence was carved in stone before you sat down. Too deep. Too heavy. Too late.',
                    'The mountain moves — and when it moves, games end. Witness.',
                ],
                winning: [
                    'I am winning, and winning, for me, is a LAW OF NATURE. Gravity. Tides. Atlas. Accept.',
                    'Feel the weight? That is material, tempo, and three thousand years of inevitability.',
                ],
                losing: [
                    'Behind... Unfamiliar. Unwelcome. ...INTRIGUING. The mountain has weathered worse eons.',
                    'You push back the inevitable. Enjoy this hour, mortal — eternities are patient, and so am I.',
                    'Losing is a weather I rarely feel. Cold. Bracing. ...I will END this weather.',
                ],
                endWin: [
                    'As foretold. The mountain stands; the climber rests. You climbed well — climb again.',
                    'Victory, inevitable as erosion. You were a worthy tremor. Rematch.',
                ],
                endLoss: [
                    '...Even mountains crack. ONCE. You have felled a titan, mortal — speak of this day forever. Then REMATCH, for the mountain does not fall twice.',
                    'Defeated. The word tastes of stone dust. Magnificent game. ...The aftershock comes NOW. Rematch.',
                ],
                endDraw: [
                    'Draw. Immovable object, meet... yourself, apparently. One more — the mountain demands a result.',
                    'Stalemate against eternity. Impressive. Unsatisfying. Again.',
                ],
            },
        },
    };

    // Per-key rotation + recent memory (anti-repeat within an event).
    const counters = {};
    const recent = {};
    function pick(botId, event, arr, moveNo) {
        const key = botId + ':' + event;
        const mem = recent[key] || [];
        const fresh = arr.filter(t => mem.indexOf(t) === -1);
        const pool = fresh.length ? fresh : arr;
        const n = (counters[key] || 0) + (moveNo || 0);
        const line = pool[n % pool.length];
        counters[key] = (counters[key] || 0) + 1;
        recent[key] = (mem.concat([line])).slice(-3);
        return line;
    }

    function fill(text, slots) {
        const s = slots || {};
        return String(text)
            .replace('{piece}', s.piece || 'piece')
            .replace('{square}', s.square || 'there')
            .replace('{move}', s.move || 'that move')
            .replace('{pawns}', s.pawns || 'a pawn or two')
            .replace('{n}', String(s.n == null ? '' : s.n));
    }

    function say(botId, event, slots, moveNo) {
        const p = PERSONAS[botId] || PERSONAS.nico;
        const pool = (p.lines && p.lines[event]) || p.lines.quiet;
        return { mood: MOODS[event] || 'straight', text: fill(pick(botId, event, pool, moveNo), slots) };
    }

    function reset(botId) {
        if (botId) {
            Object.keys(counters).forEach(k => { if (k.indexOf(botId + ':') === 0) delete counters[k]; });
            Object.keys(recent).forEach(k => { if (k.indexOf(botId + ':') === 0) delete recent[k]; });
        } else {
            Object.keys(counters).forEach(k => delete counters[k]);
            Object.keys(recent).forEach(k => delete recent[k]);
        }
    }

    // Roster flavor: name + revealed playstyle per bot (chess.com-style).
    function styleFor(botId) {
        const p = PERSONAS[botId];
        return p ? p.style : '';
    }

    window.DoChessDialogue = { say, reset, styleFor, PERSONAS, BANNED, MOODS };
})();
