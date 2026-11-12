# Build th? Scratch cho Windows b?ng GitHub Actions

Workflow **Windows test build** t?o b? c�i Windows x64 t? ma trong repository, kh�ng t?o GitHub Release v� kh�ng c?n c�i c�ng c? l?p tr�nh tr�n m�y. N� d�ng Node.js LTS, Rust stable v� c�c phi�n b?n dependencies du?c kh�a trong repository.

## Ch?y workflow

1. Merge pull request ch?a workflow v�o nh�nh m?c d?nh `main`.
2. M? tab **Actions** trong repository Scratch c?a b?n. N?u GitHub y�u c?u b?t Actions cho fork, hay b?t theo hu?ng d?n tr�n m�n h�nh.
3. Trong danh s�ch b�n tr�i, ch?n **Windows test build**. Ch?n d�ng workflow n�y: **Release** l� workflow ph�t h�nh ri�ng c?a d? �n.
4. Nh?n **Run workflow**, ch?n nh�nh mu?n build (thu?ng l� `main`), r?i nh?n **Run workflow** l?n n?a. Nh�nh du?c ch?n ph?i ch?a workflow v� c?u h�nh build th?.
5. M? l?n ch?y v?a t?o v� d?i c�c bu?c ho�n th�nh. L?n d?u c� th? m?t th?i gian hon v� chua c� cache.

Workflow cung t? ch?y khi m?t pull request v�o `main` thay d?i file workflow ho?c c?u h�nh build th?, d? ki?m tra c�c thay d?i n�y tru?c khi merge. V?i c�c thay d?i ma ?ng d?ng th�ng thu?ng, hay ch?y th? c�ng sau khi merge ho?c ch?n nh�nh tuong ?ng.

## T?i v� c�i d?t

1. Khi l?n ch?y c� d?u t�ch xanh, m? trang c?a l?n ch?y d�.
2. Cu?n xu?ng **Artifacts** v� t?i **scratch-windows-x64**. GitHub c� th? y�u c?u dang nh?p.
3. Gi?i n�n file ZIP v� ch?y m?t trong c�c b? c�i `.exe` ho?c `.msi` b�n trong. N?u c� c? hai, ch? c?n d�ng m?t b? c�i.

Artifact du?c luu trong 14 ng�y; sau khi h?t h?n, hay ch?y workflow l?i. D�y l� b?n build th? chua ky b?ng ch?ng ch? Windows, v� v?y Windows c� th? hi?n th? c?nh b�o khi m? b? c�i. WebView2 c� th? c?n du?c t?i v? trong qu� tr�nh c�i d?t.

## Luu y v? fork

Build th? gi? nguy�n d?nh danh ?ng d?ng v� c?u h�nh c?p nh?t c?a Scratch g?c. N?u da c�i Scratch g?c, b? c�i n�y c� th? d�ng chung ho?c thay th? c�i d?t hi?n c�; hay sao luu d? li?u tru?c khi th?. C?u h�nh updater v?n tr? t?i b?n ph�t h�nh c?a `erictli/scratch`, kh�ng ph?i b?n ph�t h�nh c?a fork. T�y ch?n build th? ch? t?t vi?c t?o v� ky *updater artifacts*, kh�ng thay d?i c?u h�nh c?p nh?t trong ?ng d?ng.

N?u workflow th?t b?i, m? l?n ch?y, ch?n bu?c c� d?u d? v� xem log d? bi?t l?i. Bu?c upload cung s? b�o l?i n?u kh�ng t�m th?y b? c�i.
