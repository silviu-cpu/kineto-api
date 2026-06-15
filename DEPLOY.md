# Deployment kineto-api — AWS Elastic Beanstalk (Docker) + RDS + CI/CD

Ghid pas-cu-pas pentru a pune backendul live în contul **`kineto-prod`**.
Frontendul (Angular) se deployează separat pe **Amplify** (vezi secțiunea finală).

> **Regiune:** alege o regiune EU (GDPR). Exemplele folosesc `eu-central-1` (Frankfurt).
> Înlocuiește peste tot dacă folosești alta (ex. `eu-north-1` Stockholm).

Toți pașii AWS se fac logat în contul **`kineto-prod`** cu `AdministratorAccess`.

---

## Prezentare arhitectură
```
GitHub (push main)
   └─ GitHub Actions: build Docker → push ECR → deploy EB
                                          │
[Angular FE @ Amplify] → HTTPS → [Elastic Beanstalk: ALB → EC2 Docker] → [RDS Postgres]
                                          │
                              env vars: DATABASE_URL, JWT_SECRET, EMAILJS_*, FRONTEND_URL
```
Migrările Prisma rulează automat la pornirea containerului (`docker-entrypoint.sh`).

---

## 1. ECR — registry pentru imaginea Docker
Consolă → **ECR** → Create repository:
- Visibility: **Private**
- Name: **`kineto-api`**

Notează URI-ul: `<ACCOUNT_ID>.dkr.ecr.eu-central-1.amazonaws.com/kineto-api`

CLI echivalent:
```bash
aws ecr create-repository --repository-name kineto-api --region eu-central-1
```

## 2. RDS Postgres (decuplat de EB)
Consolă → **RDS** → Create database:
- Engine: **PostgreSQL** (v16)
- Template: **Free tier** sau **Production** după caz
- Instance: **`db.t4g.micro`**
- Storage: 20 GB gp3
- Credentials: user `kineto`, parolă puternică (notează-o)
- **Public access: No**
- Initial database name: `kineto`
- VPC: cel default (sau VPC-ul tău)

După creare notează **endpoint-ul** (ex. `kineto.xxxx.eu-central-1.rds.amazonaws.com`).
`DATABASE_URL` va fi:
```
postgresql://kineto:<PAROLA>@<ENDPOINT>:5432/kineto?schema=public
```

> **Security group:** după ce creezi mediul EB (pasul 3), editează SG-ul RDS să permită
> intrarea pe **5432** din **security group-ul instanțelor EB** (nu din toată lumea).

## 3. Elastic Beanstalk — aplicație + mediu
Consolă → **Elastic Beanstalk** → Create application:
- Application name: **`kineto-api`**
- Platform: **Docker** → „Docker running on 64bit Amazon Linux 2023"
- Application code: **Sample application** (îl înlocuim imediat prin CI/CD)
- Environment type: **Load balanced** (pentru HTTPS prin ALB)
- Environment name: ex. **`kineto-api-prod`**

După creare:
1. **Instance profile cu acces ECR:** IAM → roluri → `aws-elasticbeanstalk-ec2-role` →
   atașează policy **`AmazonEC2ContainerRegistryReadOnly`** (ca instanțele să tragă imaginea).
2. **Variabile de mediu:** EB → Configuration → **Updates, monitoring, and logging** →
   *Environment properties*:
   | Cheie | Valoare |
   |---|---|
   | `DATABASE_URL` | `postgresql://kineto:...@<endpoint>:5432/kineto?schema=public` |
   | `JWT_SECRET` | (string lung, random) |
   | `JWT_EXPIRES_IN` | `1d` |
   | `EMAILJS_SERVICE_ID` | … |
   | `EMAILJS_TEMPLATE_ID` | … |
   | `EMAILJS_PUBLIC_KEY` | … |
   | `EMAILJS_PRIVATE_KEY` | … |
   | `CLINIC_NOTIFY_EMAIL` | adresa clinicii |
   | `FRONTEND_URL` | URL-ul Amplify (după pasul 7) |
   | `NODE_ENV` | `production` |

   > Pentru secrete „adevărate" poți folosi SSM Parameter Store, dar env properties e suficient la început.

3. Conectează SG-ul RDS la SG-ul EB (vezi nota de la pasul 2).

## 4. IAM — rol OIDC pentru GitHub Actions
Permite GitHub să facă deploy fără chei statice.

1. IAM → **Identity providers** → Add provider:
   - Type: **OpenID Connect**
   - Provider URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`
2. IAM → **Roles** → Create role → **Web identity** → providerul de mai sus:
   - Condiție pe repo-ul tău: `repo:<owner>/<repo>:ref:refs/heads/main`
3. Atașează permisiuni (minim necesare):
   - `AmazonEC2ContainerRegistryPowerUser` (push ECR)
   - `AWSElasticBeanstalkWebTier` + permisiuni `elasticbeanstalk:*` pe aplicația ta
   - `s3:PutObject` pe bucketul de bundle (pasul 5)
4. Notează **ARN-ul rolului** → îl pui ca secret GitHub `AWS_ROLE_ARN`.

## 5. S3 — bucket pentru bundle-urile EB
```bash
aws s3 mb s3://kineto-eb-deploys-<sufix-unic> --region eu-central-1
```
Numele → variabila GitHub `EB_S3_BUCKET`.

## 6. Config GitHub (repo → Settings)
**Secrets** (Settings → Secrets and variables → Actions → *Secrets*):
- `AWS_ROLE_ARN` = ARN-ul rolului de la pasul 4

**Variables** (același loc → *Variables*):
- `AWS_REGION` = `eu-central-1`
- `ECR_REPOSITORY` = `kineto-api`
- `EB_APPLICATION_NAME` = `kineto-api`
- `EB_ENVIRONMENT_NAME` = `kineto-api-prod`
- `EB_S3_BUCKET` = numele bucketului de la pasul 5

Apoi **push pe `main`** → workflow-ul `.github/workflows/deploy.yml` construiește imaginea,
o urcă în ECR și deployează pe EB.

## 7. Seed inițial (o singură dată)
Migrările rulează automat la pornire. Pentru datele inițiale (admin + servicii), rulează seed-ul
o dată, cu `DATABASE_URL` pointat spre RDS:
```bash
# de pe mașina ta, cu acces temporar la RDS (sau dintr-un bastion)
DATABASE_URL="postgresql://kineto:...@<endpoint>:5432/kineto?schema=public" npx prisma db seed
```
> Alternativ: deschide temporar RDS (public + IP-ul tău în SG), rulează, apoi închide la loc.

## 8. HTTPS + domeniu
- Cumpără/configurează un domeniu (Route 53 sau extern).
- **ACM** (în regiunea EB) → request certificate pentru `api.domeniul-tau.ro` (validare DNS).
- EB → Configuration → **Load balancer** → adaugă listener **443 (HTTPS)** cu certificatul ACM.
- Route 53 → record `api.domeniul-tau.ro` → alias către ALB-ul mediului EB.

## 9. Verificare
```bash
curl https://api.domeniul-tau.ro/health          # {"status":"ok",...}
curl https://api.domeniul-tau.ro/services        # lista serviciilor (după seed)
```
- EB environment health = **Green**.
- EB → Logs: la pornire apare „Running database migrations" rulat curat.

---

## Frontend (Angular) pe AWS Amplify
FE-ul e alt repo. În contul `kineto-prod`:
1. Consolă → **Amplify** → **Create new app** → **Host web app** → conectează **GitHub** → alege repo-ul FE + branch-ul.
2. Amplify detectează Angular; verifică build settings:
   - Build command: `npm run build`
   - Output directory: `dist/<nume-proiect>` (sau `dist/<app>/browser` la Angular nou).
3. (Opțional) Setează variabila de mediu cu URL-ul API: `API_URL=https://api.domeniul-tau.ro`.
4. Deploy → primești un domeniu HTTPS `https://<branch>.<id>.amplifyapp.com` (sau domeniu custom).
5. **Important:** pune acel domeniu în EB la **`FRONTEND_URL`** (pentru CORS) și redeployează BE.

---

## Note & costuri
- Cost estimativ (EU, trafic mic): EC2 `t4g.small` ~$12 + ALB ~$16 + RDS `t4g.micro` ~$15 ⇒ **~$43/lună**.
- Variantă mai ieftină: mediu **Single instance** (fără ALB) ~$21–27/lună, dar HTTPS trebuie
  rezolvat altfel (CloudFront în față, sau TLS în container) — nu recomandat pentru TLS curat.
- Migrare în entrypoint = ok la rolling deploy (Prisma folosește lock).
- RDS **decuplat** supraviețuiește recreării mediului EB.