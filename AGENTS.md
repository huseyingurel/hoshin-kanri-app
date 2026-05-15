<!-- BEGIN:nextjs-agent-rules -->
# Bu bildiğin eski Next.js değil

Bu projede kullanılan Next.js sürümü çok yenidir ve önceki sürümlere göre kırıcı değişiklikler içerebilir. API’ler, dosya yapısı, App Router davranışı, Server Actions, caching ve build kuralları eğitim verilerindeki eski bilgilerden farklı olabilir.

Next.js ile ilgili herhangi bir kod değişikliği yapmadan önce `node_modules/next/dist/docs/` altındaki ilgili dokümanı oku. Uyarıları, deprecation notlarını ve yeni davranışları dikkate al.
<!-- END:nextjs-agent-rules -->

# AGENTS.md

## Proje Bağlamı

Bu proje bir Hoshin Kanri web uygulamasıdır.

Proje önce Google Antigravity ile prototiplenmiş, ardından Cursor ile geliştirilmiş, şimdi de Codex ile teknik denetimden geçirilmekte ve güvenli şekilde iyileştirilmektedir.

Projede görünen ana teknoloji yığını:

- Next.js 16.2.4
- React 19.2.4
- TypeScript
- Prisma
- Vitest
- ESLint
- Tailwind CSS
- Vercel deployment
- `xlsx` ile Excel import desteği

## Ana Amaç

Amaç uygulamayı baştan yazmak değildir.

Amaç:

- Mevcut çalışan davranışı korumak
- Projeyi teknik olarak denetlemek
- Build, test ve lint durumunu güvenceye almak
- Kimlik doğrulama, oturum ve yetki kontrollerini sağlamlaştırmak
- Veri kapsamı ve rol bazlı erişim risklerini azaltmak
- Prisma ve veri modeli tarafını tutarlı hale getirmek
- KPI, RAG ve Excel import mantığını doğrulamak
- Gerektiğinde küçük, anlaşılır ve geri alınabilir iyileştirmeler yapmaktır

## İyileştirme Öncelikleri

Çalışmalarda şu öncelik sırası izlenmelidir:

1. Build kararlılığı
2. Runtime kararlılığı
3. Kimlik doğrulama ve oturum güvenliği
4. Yetki kontrolü ve veri kapsamı doğruluğu
5. Prisma schema tutarlılığı
6. Seed ve veritabanı scriptlerinin güvenilirliği
7. KPI ve KPI RAG mantığının doğruluğu
8. Excel import güvenilirliği
9. Test kapsamı
10. Lint ve TypeScript kalitesi
11. UI/UX iyileştirmeleri
12. Refaktör çalışmaları

Refaktör, temel kararlılık sağlandıktan sonra yapılmalıdır.

## Codex İçin Kesin Kurallar

- Tüm projeyi baştan yazma.
- Büyük mimari değişiklik yapma.
- Çok sayıda dosyayı aynı anda değiştirme.
- Kod değiştirmeden önce ilgili dosyaları incele.
- Küçük ve review edilebilir yamalar üret.
- Mevcut kullanıcı akışlarını bozma.
- Mevcut özellikleri silme.
- Yeni iş kuralı uydurma.
- Hoshin Kanri iş mantığı belirsizse varsayım yapma; belirsizliği raporla.
- Veritabanı şemasını keyfi değiştirme.
- Vercel deployment varsayımlarını gerekçesiz değiştirme.
- Gereksiz bağımlılık ekleme.
- `.env`, API key, token, private key, database URL veya credential dosyalarını commit etme.
- Kimlik doğrulama, yetkilendirme, erişim kontrolü veya veri filtreleme mantığını zayıflatma.
- Client-side filtrelemeyi tek başına yeterli kabul etme.
- Server action ve veritabanı sorgularında erişim kontrolünü sunucu tarafında uygula.

## Next.js Kuralları

Bu proje çok güncel bir Next.js sürümü kullanmaktadır.

Next.js ile ilgili değişiklik yapmadan önce yerel dokümantasyonu kontrol et:

```bash
node_modules/next/dist/docs/