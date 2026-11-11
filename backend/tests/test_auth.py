"""Accounts and roles: register / login / me / logout, session expiry, and who may claim, prove, donate, or run council."""
from datetime import timedelta

from app.config import Settings
from app.models import User, UserSession, utcnow
from app.security import hash_password, verify_password
from app.seed import reset_demo
from app.services.auth import ensure_council_user
from pydantic import SecretStr
from sqlalchemy import select

from tests.conftest import COUNCIL, jpeg, register_user, worker_headers
from tests.test_endpoints import API, IK, SPOT, claim, err, make_bounty, proof

CLAIM = {"worker_name": "Asha", "paypal_email": "asha@example.com"}


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def make_council(db, email="council@example.com", password="council-pass-1"):
    ensure_council_user(db, Settings(COUNCIL_EMAIL=SecretStr(email), COUNCIL_PASSWORD=SecretStr(password)))
    return email, password


def login(client, email, password):
    return client.post(f"{API}/auth/login", json={"email": email, "password": password})


# --- register / login / me / logout ---
def test_register_login_me_logout(client, db):
    r = client.post(f"{API}/auth/register",
                    json={"name": " Asha ", "email": "Asha@Example.COM", "password": "hunter2hunter2"})
    assert r.status_code == 201
    body = r.json()
    assert set(body) == {"user", "token"} and body["token"].startswith("st_")
    assert body["user"] == {"id": body["user"]["id"], "name": "Asha", "email": "asha@example.com", "role": "worker"}

    me = client.get(f"{API}/auth/me", headers=bearer(body["token"]))
    assert me.status_code == 200 and me.json() == {"user": body["user"]}

    r2 = login(client, "ASHA@example.com", "hunter2hunter2")
    assert r2.status_code == 200 and r2.json()["user"] == body["user"] and r2.json()["token"] != body["token"]

    # only the sha256 of the token is stored, and the password is a salted scrypt hash
    user = db.scalar(select(User))
    assert user.password_hash.startswith("scrypt$") and "hunter2hunter2" not in user.password_hash
    assert body["token"] not in {s.token_hash for s in db.scalars(select(UserSession))}

    out = client.post(f"{API}/auth/logout", headers=bearer(body["token"]))
    assert out.status_code == 204 and out.content == b""
    err(client.get(f"{API}/auth/me", headers=bearer(body["token"])), 401, "UNAUTHORIZED")
    assert client.get(f"{API}/auth/me", headers=bearer(r2.json()["token"])).status_code == 200  # other session lives


def test_register_validation(client):
    ok = {"name": "A", "email": "a@b.co", "password": "longenough"}
    for bad in ({"name": ""}, {"name": "x" * 81}, {"email": "nope"}, {"password": "short"}, {"password": "p" * 129}):
        err(client.post(f"{API}/auth/register", json=ok | bad), 422, "VALIDATION_ERROR")
    err(client.post(f"{API}/auth/register", json={k: v for k, v in ok.items() if k != "name"}), 422, "VALIDATION_ERROR")


def test_duplicate_email(client):
    register_user(client, email="dup@example.com")
    e = err(client.post(f"{API}/auth/register",
                        json={"name": "B", "email": "DUP@example.com", "password": "another-pass"}),
            422, "VALIDATION_ERROR")
    assert e["message"] == "An account with this email already exists"


def test_wrong_password_and_unknown_email_look_the_same(client):
    register_user(client, email="real@example.com", password="right-password")
    a = err(login(client, "real@example.com", "wrong-password"), 401, "UNAUTHORIZED")
    b = err(login(client, "ghost@example.com", "whatever-pass"), 401, "UNAUTHORIZED")
    assert a == b and a["message"] == "Invalid email or password"


def test_password_hash_format():
    h = hash_password("pw-12345678")
    scheme, salt, digest = h.split("$")
    assert scheme == "scrypt" and len(bytes.fromhex(salt)) == 16 and len(digest) == 128
    assert verify_password("pw-12345678", h) and not verify_password("pw-1234567", h)
    assert h != hash_password("pw-12345678")  # fresh salt each time
    assert not verify_password("x", "garbage") and not verify_password("x", "md5$aa$bb")


def test_auth_rate_limits(client):
    for _ in range(10):
        login(client, "x@example.com", "password-x")
    err(login(client, "x@example.com", "password-x"), 429, "RATE_LIMITED")
    for i in range(10):
        client.post(f"{API}/auth/register", json={"name": "A", "email": f"u{i}@example.com", "password": "password-x"})
    err(client.post(f"{API}/auth/register", json={"name": "A", "email": "last@example.com", "password": "password-x"}),
        429, "RATE_LIMITED")


# --- session validity ---
def test_missing_malformed_expired_and_revoked_sessions(client, db):
    for headers in ({}, {"Authorization": "Bearer"}, {"Authorization": "Bearer st_nope"},
                    {"Authorization": "Basic abc"}, {"Authorization": "Bearer test-council-key"}):
        e = err(client.get(f"{API}/auth/me", headers=headers), 401, "UNAUTHORIZED")
        assert e["message"] == "Sign in required"
    err(client.post(f"{API}/auth/logout"), 401, "UNAUTHORIZED")

    token = register_user(client)
    row = db.scalar(select(UserSession))
    assert timedelta(days=6, hours=23) < row.expires_at.replace(tzinfo=utcnow().tzinfo) - utcnow() <= timedelta(days=7)
    row.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    err(client.get(f"{API}/auth/me", headers=bearer(token)), 401, "UNAUTHORIZED")


# --- role escalation ---
def test_role_cannot_be_self_assigned(client, db):
    err(client.post(f"{API}/auth/register",
                    json={"name": "Eve", "email": "eve@example.com", "password": "password-1", "role": "council"}),
        422, "VALIDATION_ERROR")
    token = register_user(client, email="eve@example.com")
    assert client.get(f"{API}/auth/me", headers=bearer(token)).json()["user"]["role"] == "worker"
    err(client.post(f"{API}/demo/reset", headers=bearer(token)), 403, "FORBIDDEN")
    assert db.scalar(select(User.role).where(User.email == "eve@example.com")) == "worker"


def test_council_user_from_settings(client, db):
    email, password = make_council(db)
    r = login(client, email, password)
    assert r.status_code == 200 and r.json()["user"]["role"] == "council"
    make_council(db, email, password)  # idempotent
    assert len(db.scalars(select(User)).all()) == 1
    ensure_council_user(db, Settings(COUNCIL_EMAIL=SecretStr("x@example.com")))  # needs both settings
    assert len(db.scalars(select(User)).all()) == 1


def test_seed_promotes_preregistered_email_and_ends_its_sessions(client, db):
    squatter = register_user(client, email="council@example.com", password="squatter-pass")
    make_council(db, "council@example.com", "real-council-pass")
    err(client.get(f"{API}/auth/me", headers=bearer(squatter)), 401, "UNAUTHORIZED")
    err(login(client, "council@example.com", "squatter-pass"), 401, "UNAUTHORIZED")
    assert login(client, "council@example.com", "real-council-pass").json()["user"]["role"] == "council"


def test_reset_keeps_accounts_and_creates_council(seeded, db, monkeypatch):
    token = register_user(seeded)
    monkeypatch.setenv("COUNCIL_EMAIL", "boss@example.com")
    monkeypatch.setenv("COUNCIL_PASSWORD", "boss-password")
    reset_demo(db, Settings())
    assert seeded.get(f"{API}/auth/me", headers=bearer(token)).status_code == 200
    assert login(seeded, "boss@example.com", "boss-password").json()["user"]["role"] == "council"


# --- worker / donor actions need a session ---
def test_claim_needs_a_session(seeded):
    bid = seeded.get(f"{API}/bounties").json()["items"][0]["id"]
    err(seeded.post(f"{API}/bounties/{bid}/claim", json=CLAIM), 401, "UNAUTHORIZED")
    err(seeded.post(f"{API}/bounties/{bid}/claim", json=CLAIM, headers=bearer("st_bogus")), 401, "UNAUTHORIZED")
    err(seeded.post(f"{API}/bounties/{bid}/claim", json=CLAIM, headers=COUNCIL), 401, "UNAUTHORIZED")  # key is no user
    assert seeded.get(f"{API}/bounties/{bid}").json()["status"] == "OPEN"
    assert seeded.post(f"{API}/bounties/{bid}/claim", json=CLAIM, headers=worker_headers(seeded)).status_code == 200


def test_proof_needs_a_session(seeded):
    bid = seeded.get(f"{API}/bounties").json()["items"][0]["id"]
    token = claim(seeded, bid)
    now = utcnow()
    files = {"before": ("b.jpg", jpeg(101), "image/jpeg"), "after": ("a.jpg", jpeg(202), "image/jpeg")}
    data = {"lat": SPOT[0], "lon": SPOT[1], "before_captured_at": (now + timedelta(seconds=1)).isoformat(),
            "after_captured_at": (now + timedelta(seconds=2)).isoformat()}
    err(seeded.post(f"{API}/bounties/{bid}/proof", files=files, data=data, headers={"X-Claim-Token": token}),
        401, "UNAUTHORIZED")
    assert proof(seeded, bid, token).status_code == 200  # session + claim token


def test_donation_needs_a_session(seeded):
    err(seeded.post(f"{API}/donations/orders", json={"amount_cents": 500}, headers=IK()), 401, "UNAUTHORIZED")
    r = seeded.post(f"{API}/donations/orders", json={"amount_cents": 500}, headers=worker_headers(seeded) | IK())
    assert r.status_code == 200 and r.json()["order_id"]


def test_reads_stay_public(seeded):
    for path in ("/health", "/bounties", "/payouts", "/donations", "/events", "/readings?device_id=yamuna-okhla-01",
                 "/river/status", "/diary/latest"):
        assert seeded.get(f"{API}{path}").status_code == 200, path


# --- council: key or council session, never a worker ---
def test_council_accepts_key_and_council_session_but_not_worker(seeded, db):
    email, password = make_council(db)
    council_token = login(seeded, email, password).json()["token"]
    worker_token = register_user(seeded)
    veto = f"{API}/payouts/none/veto"
    body = {"reason": "r"}
    err(seeded.post(veto, json=body, headers=bearer(worker_token)), 403, "FORBIDDEN")
    err(seeded.post(veto, json=body), 401, "UNAUTHORIZED")
    err(seeded.post(veto, json=body, headers=bearer("st_bogus")), 401, "UNAUTHORIZED")
    err(seeded.post(veto, json=body, headers=bearer("wrong-key")), 401, "UNAUTHORIZED")
    # authorized callers get past auth and reach the 404 for a payout that does not exist
    err(seeded.post(veto, json=body, headers=bearer(council_token)), 404, "NOT_FOUND")
    err(seeded.post(veto, json=body, headers=COUNCIL), 404, "NOT_FOUND")
    assert seeded.post(f"{API}/demo/reset", headers=bearer(council_token)).json() == {"reset": True}


def test_council_session_approves_a_pending_payout(seeded, db, monkeypatch):
    email, password = make_council(db)
    council = bearer(login(seeded, email, password).json()["token"])
    bid = make_bounty(seeded, amount=2500, monkeypatch=monkeypatch)  # above the council threshold
    pid = proof(seeded, bid, claim(seeded, bid)).json()["bounty"]["payout"]["id"]
    other = bearer(register_user(seeded, "w2@example.com"))
    err(seeded.post(f"{API}/payouts/{pid}/approve", json={}, headers=other | IK()), 403, "FORBIDDEN")
    r = seeded.post(f"{API}/payouts/{pid}/approve", json={}, headers=council | IK())
    assert r.status_code == 200, r.text
