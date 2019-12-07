#include <bits/stdc++.h>
#define RG register
using namespace std;

inline int read() {
    int data = 0, w = 1;
    char ch = getchar();
    while (ch != '-' && (ch < '0' || ch > '9')) ch = getchar();
    if (ch == '-')
        w = -1, ch = getchar();
    while (ch >= '0' && ch <= '9') data = data * 10 + ch - '0', ch = getchar();
    return data * w;
}

struct edge_array {
    int from, to, dis;
};

int n, m;

struct edge {
    int next, to, dis;
} e[700010];
int head[400010], e_num, val[400010], dis[400010], deep[400010], size[400010];
int pos[400010], belong[400010], f[400010], cnt_pos[400010];
int heavy[400010];
bool visit[400010];
void add_edge(int from, int to, int dis) {
    e[++e_num] = { head[from], to, dis };
    head[from] = e_num;
    e[++e_num] = { head[to], from, dis };
    head[to] = e_num;
}

int node[4 * 400010];

// begin Tree chain subdivision and LCA
void dfs1(int x) {
    visit[x] = true;
    size[x] = 1;
    int _max = 0, _maxi = 0;
    for (RG int i = head[x]; i; i = e[i].next) {
        if (visit[e[i].to])
            continue;
        deep[e[i].to] = deep[x] + 1;
        dis[e[i].to] = dis[x] + (val[e[i].to] = e[i].dis);
        f[e[i].to] = x;
        dfs1(e[i].to);
        size[x] += size[e[i].to];
        if (size[e[i].to] > _max)
            _max = size[e[i].to], _maxi = e[i].to;
    }
    heavy[x] = _maxi;
}

int cnt_node = 0;
void dfs2(int x, int chain) {
    int k = heavy[x];
    pos[x] = (++cnt_node);
    cnt_pos[cnt_node] = x;
    belong[x] = chain;
    if (k == 0)
        return;
    dfs2(k, chain);
    for (RG int i = head[x]; i; i = e[i].next) {
        if (deep[e[i].to] > deep[x] && (e[i].to != k))
            dfs2(e[i].to, e[i].to);
    }
}

int LCA(int a, int b) {
    if (belong[a] == belong[b])
        return (pos[a] < pos[b] ? a : b);
    return (pos[belong[a]] < pos[belong[b]] ? LCA(a, f[belong[b]]) : LCA(f[belong[a]], b));
}
// end Tree chain subdivision and LCA

// begin Segment_tree
#define son(i) ((root << 1) | i)
void build(int root, int l, int r) {
    if (l == r) {
        node[root] = val[cnt_pos[l]];
        return;
    }
    int mid = (l + r) >> 1;
    build(son(0), l, mid);
    build(son(1), mid + 1, r);
    node[root] = max(node[son(0)], node[son(1)]);
}

int query(int root, int nl, int nr, int ql, int qr) {
    if (qr < nl || nr < ql)
        return 0;
    if (nl > nr)
        return 0;
    if (ql <= nl && nr <= qr)
        return node[root];
    int mid = (nl + nr) >> 1;
    return max(query(son(0), nl, mid, ql, qr), query(son(1), mid + 1, nr, ql, qr));
}
// end Segment_tree

// begin solve

int solve(int a, int b) {
    if (belong[a] == belong[b])
        return query(1, 1, n, min(pos[a], pos[b]) + 1, max(pos[a], pos[b]));
    if (pos[belong[a]] < pos[belong[b]])
        return max(query(1, 1, n, pos[belong[b]], pos[b]), solve(a, f[belong[b]]));
    return max(query(1, 1, n, pos[belong[a]], pos[a]), solve(f[belong[a]], b));
}
// end solve

// begin tran
edge_array tran_set[400010];
bool tran_set_cmp(const edge_array &a, const edge_array &b) { return a.dis > b.dis; }

//// begin link tran
#define tran edge_array
tran link_double_sub(tran a, tran b) {
    int tail = LCA(a.to, b.to);
    if (pos[tail] <= pos[a.from] || pos[tail] <= pos[b.from])
        return { 0, 0, 0 };
    return (pos[a.from] > pos[b.from] ? tran({ a.from, tail, 0 }) : tran({ b.from, tail, 0 }));
}

tran link_sub(tran a, tran b) {
    int lca = LCA(b.from, b.to);
    if (b.from == lca)
        return link_double_sub(a, b);
    tran c = link_double_sub(a, { lca, b.from });
    if (c.from)
        return c;
    tran d = link_double_sub(a, { lca, b.to });
    if (d.from)
        return d;
    return { 0, 0, 0 };
}

tran link(tran a, tran b) {
    int lcaa = LCA(a.from, a.to);
    int lcab = LCA(b.from, b.to);
    if (a.from == lcaa)
        return link_sub(a, b);
    if (b.from == lcab)
        return link_sub(b, a);
    tran c = link_sub({ lcaa, a.from }, b);
    tran d = link_sub({ lcaa, a.to }, b);
    if (c.from && d.from) {
        return { c.to, d.to, 0 };
    }
    if (c.from)
        return c;
    if (d.from)
        return d;
    return { 0, 0, 0 };
}
#undef tran
//// end link

// end tran

/* REMEMBER:
** n: n 个星球,还有 n-1 条双向航道
** m: m 个运输计划
*/
int main() {
    n = read();
    m = read();
    for (RG int i = 1; i < n; i++) {
        int from = read();
        int to = read();
        int dis = read();
        add_edge(from, to, dis);
    }
    dfs1(1);
    dfs2(1, 1);
    build(1, 1, n);
    for (RG int i = 1; i <= m; i++) {
        int a = read();
        int b = read();
        if (pos[a] >= pos[b])
            swap(a, b);
        tran_set[i] = { a, b, 0 };
        tran_set[i].dis =
            dis[tran_set[i].from] + dis[tran_set[i].to] - 2 * dis[LCA(tran_set[i].from, tran_set[i].to)];
    }
    // great
    if (m == 1) {
        return printf("%d\n", tran_set[1].dis - solve(tran_set[1].from, tran_set[1].to)) & 0;
    }
    sort(tran_set + 1, tran_set + m + 1, tran_set_cmp);
#define tran edge_array
    tran last = tran_set[1];
    int maxx = solve(last.from, last.to);
    int ans = last.dis - maxx;
    for (RG int i = 2; i <= m; i++) {
        if (tran_set[1].dis - maxx > tran_set[i].dis)
            break;
        else
            ans = tran_set[i].dis;
        last = link(last, tran_set[i]);
        if (!last.from) {
            ans = tran_set[i].dis;
            break;
        }
        maxx = solve(last.from, last.to);
        if (tran_set[i].dis < tran_set[1].dis - maxx)
            break;
        ans = tran_set[1].dis - maxx;
    }
    printf("%d\n", ans);
#undef tran
    return 0;
}