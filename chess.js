/**
 * chess.js — Chess Engine for Chess Course
 * Full legal move generation · castling · en passant · promotion
 * Supports pending-promotion state for UI picker
 */

class ChessGame {
    constructor() { this.reset(); }

    reset() {
        this.board = this._startBoard();
        this.currentPlayer = 'white';
        this.moveHistory   = [];
        this.selectedSquare = null;
        this.legalMoves    = [];
        this.gameOver      = false;
        this.result        = null;
        this.castlingRights = { K: true, Q: true, k: true, q: true };
        this.enPassantTarget = null;
        // When a pawn reaches the back rank we store the pending move here
        // and wait for the player to choose a piece before finalising.
        this.pendingPromotion = null; // { from:[r,c], to:[r,c] }
    }

    _startBoard() {
        return [
            ['r','n','b','q','k','b','n','r'],
            ['p','p','p','p','p','p','p','p'],
            ['','','','','','','',''],
            ['','','','','','','',''],
            ['','','','','','','',''],
            ['','','','','','','',''],
            ['P','P','P','P','P','P','P','P'],
            ['R','N','B','Q','K','B','N','R']
        ];
    }

    // ── FEN ─────────────────────────────────────────────────────────────
    loadFEN(fen) {
        const parts = fen.split(' ');
        this.board = Array.from({length:8}, () => Array(8).fill(''));
        parts[0].split('/').forEach((row, r) => {
            let c = 0;
            for (const ch of row) {
                if (ch >= '1' && ch <= '8') c += +ch;
                else this.board[r][c++] = ch;
            }
        });
        this.currentPlayer  = parts[1] === 'b' ? 'black' : 'white';
        const cr = parts[2] || '-';
        this.castlingRights = { K: cr.includes('K'), Q: cr.includes('Q'), k: cr.includes('k'), q: cr.includes('q') };
        this.enPassantTarget = (parts[3] && parts[3] !== '-') ? this._algToRC(parts[3]) : null;
        this.moveHistory = [];
        this.selectedSquare = null;
        this.legalMoves = [];
        this.gameOver = false;
        this.result = null;
        this.pendingPromotion = null;
    }

    // ── Coordinate helpers ───────────────────────────────────────────────
    _algToRC(alg) { return [8 - parseInt(alg[1]), alg.charCodeAt(0) - 97]; }
    _rcToAlg(r, c) { return String.fromCharCode(97 + c) + (8 - r); }
    coordsToAlgebraic([r, c]) { return this._rcToAlg(r, c); }
    algebraicToCoords(alg) { return this._algToRC(alg); }

    // ── Board helpers ────────────────────────────────────────────────────
    inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
    pieceAt(r, c)  { return this.inBounds(r, c) ? this.board[r][c] || null : null; }
    getPieceAt([r, c]) { return this.pieceAt(r, c) || ''; }
    isEmpty(r, c)  { return this.inBounds(r, c) && this.board[r][c] === ''; }
    colorOf(p)     { return !p ? null : p === p.toUpperCase() ? 'white' : 'black'; }
    isColor(r, c, col) { const p = this.pieceAt(r, c); return !!p && this.colorOf(p) === col; }
    isPieceAt(pos, col) { return this.isColor(pos[0], pos[1], col); }
    enemy(col)     { return col === 'white' ? 'black' : 'white'; }
    findKing(col)  {
        const k = col === 'white' ? 'K' : 'k';
        for (let r=0;r<8;r++) for (let c=0;c<8;c++) if (this.board[r][c]===k) return [r,c];
        return null;
    }

    // ── Move generation ──────────────────────────────────────────────────
    getLegalMoves(pos) {
        const [r, c] = pos;
        const piece = this.pieceAt(r, c);
        if (!piece) return [];
        const color = this.colorOf(piece);
        return this._rawMoves(r, c, piece, color)
            .filter(([tr, tc]) => !this._moveLeavesKingInCheck(r, c, tr, tc, color));
    }

    _rawMoves(r, c, piece, color) {
        switch (piece.toLowerCase()) {
            case 'p': return this._pawnMoves(r, c, color);
            case 'r': return this._slide(r, c, color, [[-1,0],[1,0],[0,-1],[0,1]]);
            case 'n': return this._knight(r, c, color);
            case 'b': return this._slide(r, c, color, [[-1,-1],[-1,1],[1,-1],[1,1]]);
            case 'q': return this._slide(r, c, color, [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]);
            case 'k': return this._kingMoves(r, c, color);
            default:  return [];
        }
    }

    _pawnMoves(r, c, color) {
        const moves = [], dir = color==='white'?-1:1, start = color==='white'?6:1;
        if (this.isEmpty(r+dir, c)) {
            moves.push([r+dir, c]);
            if (r===start && this.isEmpty(r+2*dir, c)) moves.push([r+2*dir, c]);
        }
        for (const dc of [-1,1]) {
            const nr=r+dir, nc=c+dc;
            if (!this.inBounds(nr,nc)) continue;
            if (this.isColor(nr, nc, this.enemy(color))) moves.push([nr,nc]);
            if (this.enPassantTarget?.[0]===nr && this.enPassantTarget?.[1]===nc) moves.push([nr,nc]);
        }
        return moves;
    }

    _slide(r, c, color, dirs) {
        const moves = [];
        for (const [dr,dc] of dirs) {
            let nr=r+dr, nc=c+dc;
            while (this.inBounds(nr,nc)) {
                if (this.board[nr][nc]==='') { moves.push([nr,nc]); }
                else { if (!this.isColor(nr,nc,color)) moves.push([nr,nc]); break; }
                nr+=dr; nc+=dc;
            }
        }
        return moves;
    }

    _knight(r, c, color) {
        return [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]
            .map(([dr,dc])=>[r+dr,c+dc])
            .filter(([nr,nc])=>this.inBounds(nr,nc)&&!this.isColor(nr,nc,color));
    }

    _kingMoves(r, c, color) {
        const moves = [];
        for (const [dr,dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
            const nr=r+dr, nc=c+dc;
            if (this.inBounds(nr,nc) && !this.isColor(nr,nc,color)) moves.push([nr,nc]);
        }
        if (this._isKingInCheck(color)) return moves;
        const back = color==='white'?7:0;
        if (r!==back || c!==4) return moves;
        const opp = this.enemy(color);
        // Kingside
        if ((color==='white'?this.castlingRights.K:this.castlingRights.k)) {
            const rk = this.pieceAt(back,7);
            if (rk && rk.toLowerCase()==='r' &&
                this.isEmpty(back,5) && this.isEmpty(back,6) &&
                !this._attacked(back,5,opp) && !this._attacked(back,6,opp))
                moves.push([back,6]);
        }
        // Queenside
        if ((color==='white'?this.castlingRights.Q:this.castlingRights.q)) {
            const rk = this.pieceAt(back,0);
            if (rk && rk.toLowerCase()==='r' &&
                this.isEmpty(back,1) && this.isEmpty(back,2) && this.isEmpty(back,3) &&
                !this._attacked(back,2,opp) && !this._attacked(back,3,opp))
                moves.push([back,2]);
        }
        return moves;
    }

    // ── Check detection ──────────────────────────────────────────────────
    _isKingInCheck(color) {
        const k = this.findKing(color);
        return k ? this._attacked(k[0], k[1], this.enemy(color)) : false;
    }

    _attacked(r, c, by) {
        // Pawn
        const pd = by==='white'?1:-1;
        for (const dc of [-1,1]) {
            const p = this.pieceAt(r+pd, c+dc);
            if (p && p.toLowerCase()==='p' && this.colorOf(p)===by) return true;
        }
        // Knight
        for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
            const p = this.pieceAt(r+dr, c+dc);
            if (p && p.toLowerCase()==='n' && this.colorOf(p)===by) return true;
        }
        // Rook / Queen (straights)
        for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            let nr=r+dr, nc=c+dc;
            while (this.inBounds(nr,nc)) {
                const p=this.pieceAt(nr,nc);
                if (p) { if (this.colorOf(p)===by&&(p.toLowerCase()==='r'||p.toLowerCase()==='q')) return true; break; }
                nr+=dr; nc+=dc;
            }
        }
        // Bishop / Queen (diagonals)
        for (const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
            let nr=r+dr, nc=c+dc;
            while (this.inBounds(nr,nc)) {
                const p=this.pieceAt(nr,nc);
                if (p) { if (this.colorOf(p)===by&&(p.toLowerCase()==='b'||p.toLowerCase()==='q')) return true; break; }
                nr+=dr; nc+=dc;
            }
        }
        // King
        for (const [dr,dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
            const p=this.pieceAt(r+dr,c+dc);
            if (p&&p.toLowerCase()==='k'&&this.colorOf(p)===by) return true;
        }
        return false;
    }

    _moveLeavesKingInCheck(fr, fc, tr, tc, color) {
        const orig=this.board[fr][fc], dest=this.board[tr][tc];
        let epR=-1, epC=-1, epSave=null;
        let rkFrom=-1, rkTo=-1, rkPiece=null;
        // Apply
        this.board[tr][tc]=orig; this.board[fr][fc]='';
        // En passant
        if (orig.toLowerCase()==='p' && dest==='' && fc!==tc) {
            epR=fr; epC=tc; epSave=this.board[epR][epC]; this.board[epR][epC]='';
        }
        // Castling rook
        if (orig.toLowerCase()==='k' && Math.abs(tc-fc)===2) {
            rkFrom=tc===6?7:0; rkTo=tc===6?5:3;
            rkPiece=this.board[fr][rkFrom];
            this.board[fr][rkTo]=rkPiece; this.board[fr][rkFrom]='';
        }
        const inCheck=this._isKingInCheck(color);
        // Restore
        this.board[fr][fc]=orig; this.board[tr][tc]=dest;
        if (epSave!==null) this.board[epR][epC]=epSave;
        if (rkPiece!==null) { this.board[fr][rkFrom]=rkPiece; this.board[fr][rkTo]=''; }
        return inCheck;
    }

    // ── Execute a move ───────────────────────────────────────────────────
    // Returns 'promotion-needed' if a pawn needs promotion choice, otherwise returns move record.
    movePiece(from, to, promotionPiece = null) {
        const [fr,fc]=from, [tr,tc]=to;
        const piece = this.board[fr][fc];
        if (!piece) return null;
        const color = this.colorOf(piece);
        const type  = piece.toLowerCase();
        let captured = this.board[tr][tc] || null;
        let specialMove = null;

        // Castling
        if (type==='k' && Math.abs(tc-fc)===2) {
            specialMove='castling';
            if (tc===6) { this.board[fr][5]=this.board[fr][7]; this.board[fr][7]=''; }
            else        { this.board[fr][3]=this.board[fr][0]; this.board[fr][0]=''; }
            if (color==='white') { this.castlingRights.K=false; this.castlingRights.Q=false; }
            else                 { this.castlingRights.k=false; this.castlingRights.q=false; }
        }

        // En passant
        let epCapturePos=null;
        if (type==='p' && this.enPassantTarget && tr===this.enPassantTarget[0] && tc===this.enPassantTarget[1]) {
            specialMove='enpassant';
            epCapturePos=[fr,tc];
            captured=this.board[fr][tc];
            this.board[fr][tc]='';
        }

        // Move piece
        this.board[tr][tc]=piece; this.board[fr][fc]='';

        // Promotion — if no promotionPiece provided yet, store as pending and return signal
        let promotion=null;
        if (type==='p' && (tr===0||tr===7)) {
            if (!promotionPiece) {
                // Revert partial move, store pending
                this.board[fr][fc]=piece; this.board[tr][tc]=captured||'';
                if (epCapturePos) this.board[fr][tc]=captured;
                if (specialMove==='castling') {
                    if (tc===6) { this.board[fr][7]=this.board[fr][5]; this.board[fr][5]=''; }
                    else        { this.board[fr][0]=this.board[fr][3]; this.board[fr][3]=''; }
                }
                this.pendingPromotion={from, to};
                return 'promotion-needed';
            }
            promotion = promotionPiece;
            this.board[tr][tc] = promotion;
            specialMove = specialMove||'promotion';
        }

        // En passant target update
        this.enPassantTarget = (type==='p' && Math.abs(tr-fr)===2) ? [(fr+tr)/2, fc] : null;

        // Castling rights
        if (type==='r') {
            if (fr===7&&fc===0) this.castlingRights.Q=false;
            if (fr===7&&fc===7) this.castlingRights.K=false;
            if (fr===0&&fc===0) this.castlingRights.q=false;
            if (fr===0&&fc===7) this.castlingRights.k=false;
        }
        if (type==='k') {
            if (color==='white') { this.castlingRights.K=false; this.castlingRights.Q=false; }
            else                 { this.castlingRights.k=false; this.castlingRights.q=false; }
        }
        if (tr===7&&tc===0) this.castlingRights.Q=false;
        if (tr===7&&tc===7) this.castlingRights.K=false;
        if (tr===0&&tc===0) this.castlingRights.q=false;
        if (tr===0&&tc===7) this.castlingRights.k=false;

        const move={from:this._rcToAlg(fr,fc), to:this._rcToAlg(tr,tc), piece, captured, promotion, specialMove};
        this.moveHistory.push(move);
        this.currentPlayer=this.enemy(this.currentPlayer);
        this.pendingPromotion=null;
        return move;
    }

    // ── Game status ──────────────────────────────────────────────────────
    hasAnyLegalMoves(color) {
        for (let r=0;r<8;r++) for (let c=0;c<8;c++)
            if (this.isColor(r,c,color) && this.getLegalMoves([r,c]).length>0) return true;
        return false;
    }
    isCheckmate() {
        // No king on board (exercise/puzzle positions) can never be checkmate
        if (!this.findKing(this.currentPlayer)) return false;
        return this._isKingInCheck(this.currentPlayer)&&!this.hasAnyLegalMoves(this.currentPlayer);
    }
    isStalemate() {
        // No king on board (exercise/puzzle positions) can never be stalemate.
        // Also require at least one piece of the side to move, otherwise
        // single-piece tutorial boards would falsely report draws.
        if (!this.findKing(this.currentPlayer)) return false;
        let hasPiece = false;
        for (let r=0;r<8;r++) for (let c=0;c<8;c++)
            if (this.isColor(r,c,this.currentPlayer)) { hasPiece = true; break; }
        if (!hasPiece) return false;
        return !this._isKingInCheck(this.currentPlayer)&&!this.hasAnyLegalMoves(this.currentPlayer);
    }
    isKingInCheckDirect(c) { return this._isKingInCheck(c); }
    getGameStatus() {
        const cp=this.currentPlayer;
        if (this.isCheckmate()) return `checkmate-${this.enemy(cp)}`;
        if (this.isStalemate()) return 'stalemate';
        if (this._isKingInCheck(cp)) return `check-${cp}`;
        return 'ongoing';
    }
}

if (typeof module!=='undefined'&&module.exports) module.exports=ChessGame;