const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));


// =====================================================
// DATABASE
// =====================================================

const db = mysql.createPool({
    host: process.env.DB_HOST || 'mysql-bb9e125-rakaksatya48-9d8d.e.aivencloud.com',
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'defaultdb',
    port: process.env.DB_PORT || 11733,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});


// =====================================================
// TEST DATABASE
// =====================================================

db.query('SELECT 1')
    .then(() => {
        console.log('Database MySQL terhubung.');
    })
    .catch((err) => {
        console.error('Database ERROR:', err.message);
    });


// =====================================================
// LOGIN
// =====================================================

app.post('/api/login', async (req, res) => {

    const { username, password } = req.body;

    try {

        const [rows] = await db.query(`
                SELECT 
                    u.id_user,
                    u.nama,
                    u.username,
                    u.password,
                    u.role,
                    f.path_foto
                FROM user u
                LEFT JOIN sample_foto f ON u.id_user = f.id_user
                WHERE u.username = ?
                LIMIT 1
            `, [username]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                error: 'Username atau password salah!'
            });
        }

        const user = rows[0];

        // SEMENTARA menggunakan password plaintext
        // karena database kamu saat ini masih menyimpan password plaintext.
        if (password !== user.password) {
            return res.status(401).json({
                error: 'Username atau password salah!'
            });
        }

        // JANGAN kirim password ke frontend
        const safeUser = {
            id_user: user.id_user,
            nama: user.nama,
            username: user.username,
            role: user.role,
            foto: user.path_foto || null
        };

        res.json({
            message: 'Login Berhasil',
            user: safeUser
        });

    } catch (err) {

        console.error('ERROR LOGIN:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


// =====================================================
// KELOLA USER
// =====================================================

app.get('/api/users', async (req, res) => {

    try {

        const [rows] = await db.query(`
            SELECT
                u.id_user,
                u.nama,
                u.username,
                IF(f.id_user IS NOT NULL, 'Sudah', 'Belum') AS status_wajah
            FROM user u
            LEFT JOIN sample_foto f ON u.id_user = f.id_user
            WHERE u.role = 'user'
        `);

        res.json(rows);

    } catch (err) {

        console.error('ERROR GET /api/users:', err);

        res.status(500).json({
            error: err.message,
            code: err.code,
            sqlMessage: err.sqlMessage
        });
    }
});


app.post('/api/users', async (req, res) => {

    const {
        username,
        password,
        nama,
        role
    } = req.body;

    try {

        const [result] = await db.query(
            'INSERT INTO user (username, password, nama, role) VALUES (?, ?, ?, ?)',
            [
                username,
                password,
                nama,
                role || 'user'
            ]
        );

        res.json({
            id_user: result.insertId,
            message: 'User berhasil ditambahkan'
        });

    } catch (err) {

        console.error('ERROR POST /api/users:', err);

        res.status(500).json({
            error: err.message,
            code: err.code,
            sqlMessage: err.sqlMessage
        });
    }
});


app.put('/api/users/:id', async (req, res) => {

    const {
        username,
        password,
        nama
    } = req.body;

    try {

        if (password) {

            await db.query(
                'UPDATE user SET username = ?, password = ?, nama = ? WHERE id_user = ?',
                [
                    username,
                    password,
                    nama,
                    req.params.id
                ]
            );

        } else {

            await db.query(
                'UPDATE user SET username = ?, nama = ? WHERE id_user = ?',
                [
                    username,
                    nama,
                    req.params.id
                ]
            );
        }

        res.json({
            message: 'User berhasil diupdate'
        });

    } catch (err) {

        console.error('ERROR PUT /api/users:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


app.delete('/api/users/:id', async (req, res) => {

    try {

        await db.query(
            'DELETE FROM user WHERE id_user = ?',
            [req.params.id]
        );

        res.json({
            message: 'User berhasil dihapus'
        });

    } catch (err) {

        console.error('ERROR DELETE /api/users:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


// =====================================================
// BIOMETRIK WAJAH
// =====================================================

app.post('/api/register-face', async (req, res) => {

    const {
        id_user,
        face_descriptor,
        foto_base64
    } = req.body;

    try {

        const descriptorStr = JSON.stringify(face_descriptor);

        const [cek] = await db.query(
            'SELECT * FROM sample_foto WHERE id_user = ?',
            [id_user]
        );

        if (cek.length > 0) {

            await db.query(
                'UPDATE sample_foto SET path_foto = ?, face_descriptor = ? WHERE id_user = ?',
                [
                    foto_base64,
                    descriptorStr,
                    id_user
                ]
            );

        } else {

            await db.query(
                'INSERT INTO sample_foto (id_user, path_foto, face_descriptor) VALUES (?, ?, ?)',
                [
                    id_user,
                    foto_base64,
                    descriptorStr
                ]
            );
        }

        res.json({
            message: 'Biometrik Wajah berhasil didaftarkan!'
        });

    } catch (err) {

        console.error('ERROR REGISTER FACE:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


app.get('/api/face-descriptor/:id_user', async (req, res) => {

    try {

        const [rows] = await db.query(
            'SELECT face_descriptor FROM sample_foto WHERE id_user = ?',
            [req.params.id_user]
        );

        if (rows.length > 0) {

            res.json({
                descriptor: rows[0].face_descriptor
            });

        } else {

            res.status(404).json({
                error: 'Wajah belum terdaftar'
            });
        }

    } catch (err) {

        console.error('ERROR GET FACE DESCRIPTOR:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


// =====================================================
// JADWAL
// =====================================================

app.get('/api/jadwal', async (req, res) => {
    try {

        const [rows] = await db.query(
            'SELECT * FROM jadwal ORDER BY id ASC'
        );

        res.json(rows);

    } catch (err) {

        console.error('ERROR GET /api/jadwal:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


app.put('/api/jadwal/:id', async (req, res) => {

    const {
        hari,
        masuk,
        batas,
        pulang
    } = req.body;

    try {

        await db.query(
            'UPDATE jadwal SET hari = ?, masuk = ?, batas = ?, pulang = ? WHERE id = ?',
            [
                hari,
                masuk,
                batas,
                pulang,
                req.params.id
            ]
        );

        res.json({
            message: 'Jadwal kerja berhasil diperbarui!'
        });

    } catch (err) {

        console.error('ERROR PUT /api/jadwal:', err);

        res.status(500).json({
            error: err.message
        });
    }
});

// ================= TAMBAH JADWAL =================

app.post('/api/jadwal', async (req, res) => {
    const { hari, masuk, batas, pulang } = req.body;

    try {
        const [result] = await db.query(
            `INSERT INTO jadwal (hari, masuk, batas, pulang)
             VALUES (?, ?, ?, ?)`,
            [hari, masuk, batas, pulang]
        );

        res.json({
            message: 'Jadwal berhasil ditambahkan',
            id: result.insertId
        });

    } catch (err) {
        console.error('ERROR POST /api/jadwal:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


// ================= HAPUS JADWAL =================

app.delete('/api/jadwal/:id', async (req, res) => {

    try {
        await db.query(
            'DELETE FROM jadwal WHERE id = ?',
            [req.params.id]
        );

        res.json({
            message: 'Jadwal berhasil dihapus'
        });

    } catch (err) {
        console.error('ERROR DELETE /api/jadwal:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


// =====================================================
// ABSENSI MASUK / PULANG
// =====================================================

app.post('/api/absen', async (req, res) => {

    const {
        id_user,
        latitude,
        longitude,
        foto_absensi,
        confidence,
        jenis_absen,
        alamat
    } = req.body;

    if (
        jenis_absen !== 'masuk' &&
        jenis_absen !== 'keluar'
    ) {
        return res.status(400).json({
            error: 'Jenis absensi tidak valid.'
        });
    }

    try {

        // ==============================
        // WAKTU INDONESIA / WIB
        // ==============================

        const now = new Date();

        const jakartaParts = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Jakarta',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(now);

        const waktu = {};

        jakartaParts.forEach(part => {
            if (part.type !== 'literal') {
                waktu[part.type] = part.value;
            }
        });

        const today = `${waktu.year}-${waktu.month}-${waktu.day}`;
        const time = `${waktu.hour}:${waktu.minute}:${waktu.second}`;

        console.log('Waktu absensi WIB:', today, time);


        // Cek absensi hari ini

        const [cek] = await db.query(
            'SELECT * FROM absensi WHERE id_user = ? AND tanggal = ?',
            [
                id_user,
                today
            ]
        );


        // =================================================
        // ABSEN MASUK
        // =================================================

        if (jenis_absen === 'masuk') {

            if (cek.length > 0) {

                return res.status(400).json({
                    error: 'Anda sudah absen masuk hari ini.'
                });
            }


            const [jadwalDb] = await db.query(
                'SELECT * FROM jadwal LIMIT 1'
            );

            let statusKehadiran = 'Hadir';

            if (jadwalDb.length > 0) {

                const batasTelat = jadwalDb[0].batas;
                const jamPulang = jadwalDb[0].pulang;

                // Jika absen pada atau setelah jam pulang
                if (time >= jamPulang) {

                    statusKehadiran = 'Tidak Hadir';

                } else if (time > batasTelat) {

                    // Jika lewat batas masuk tetapi belum jam pulang
                    statusKehadiran = 'Terlambat';

                } else {

                    statusKehadiran = 'Hadir';
                }
            }


            await db.query(
                `INSERT INTO absensi
                (
                    id_user,
                    tanggal,
                    jam_masuk,
                    status,
                    foto_absensi,
                    confidence,
                    latitude,
                    longitude,
                    lat_lon,
                    alamat
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id_user,
                    today,
                    time,
                    statusKehadiran,
                    foto_absensi,
                    confidence,
                    latitude,
                    longitude,
                    `${latitude},${longitude}`,
                    alamat
                ]
            );


            return res.json({
                message: `Absen MASUK direkam! Status: ${statusKehadiran}`
            });
        }


        // =================================================
        // ABSEN PULANG
        // =================================================

        if (jenis_absen === 'keluar') {

            // Cek apakah sudah absen masuk
            if (cek.length === 0) {
                return res.status(400).json({
                    error: 'Anda belum absen masuk hari ini.'
                });
            }

            // Cek apakah sudah absen pulang
            if (cek[0].jam_keluar !== null) {
                return res.status(400).json({
                    error: 'Anda sudah absen pulang hari ini.'
                });
            }

            // =============================================
            // CEK WAKTU PULANG
            // =============================================

            const [jadwalDb] = await db.query(
                'SELECT * FROM jadwal LIMIT 1'
            );

            if (jadwalDb.length === 0) {
                return res.status(500).json({
                    error: 'Jadwal kerja belum tersedia.'
                });
            }

            const jadwalPulang = jadwalDb[0].pulang;

            // Ambil format HH:mm:ss dari database
            const batasPulang = String(jadwalPulang).substring(0, 8);

            // Bandingkan waktu sekarang dengan jadwal pulang
            if (time < batasPulang) {

                return res.status(400).json({
                    error: `Belum waktunya absen pulang. Absen pulang dimulai pukul ${batasPulang.substring(0, 5)} WIB.`
                });
            }

            // =============================================
            // SIMPAN ABSEN PULANG
            // =============================================

            await db.query(
                `UPDATE absensi
                SET
                    jam_keluar = ?,
                    foto_absensi = ?,
                    confidence = ?,
                    latitude = ?,
                    longitude = ?,
                    lat_lon = ?,
                    alamat = ?
                WHERE id_user = ?
                AND tanggal = ?`,
                [
                    time,
                    foto_absensi,
                    confidence,
                    latitude,
                    longitude,
                    `${latitude},${longitude}`,
                    alamat,
                    id_user,
                    today
                ]
            );

            return res.json({
                message: 'Absen PULANG berhasil direkam!'
            });
        }

    } catch (err) {

        console.error('ERROR POST /api/absen:', err);

        res.status(500).json({
            error: err.message,
            code: err.code,
            sqlMessage: err.sqlMessage
        });
    }
});


// =====================================================
// LAPORAN ABSENSI
// =====================================================

app.get('/api/laporan', async (req, res) => {

    try {

        const [rows] = await db.query(`
            SELECT
                a.id_absensi AS id,
                DATE_FORMAT(a.tanggal, '%d %b %Y') AS tanggal,
                u.nama,
                a.jam_masuk,
                a.jam_keluar,
                a.status,
                a.latitude,
                a.longitude,
                a.alamat
            FROM absensi a
            JOIN user u ON a.id_user = u.id_user
            ORDER BY a.tanggal DESC, a.jam_masuk DESC
        `);

        res.json(rows);

    } catch (err) {

        console.error('ERROR GET /api/laporan:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


// =====================================================
// RIWAYAT USER
// =====================================================

app.get('/api/riwayat/:id_user', async (req, res) => {

    try {

        const [rows] = await db.query(`
            SELECT
                id_absensi AS id,
                DATE_FORMAT(tanggal, '%d %b %Y') AS tanggal,
                jam_masuk,
                jam_keluar,
                status,
                latitude,
                longitude,
                alamat
            FROM absensi
            WHERE id_user = ?
            ORDER BY tanggal DESC, jam_masuk DESC
        `, [
            req.params.id_user
        ]);

        res.json(rows);

    } catch (err) {

        console.error('ERROR GET /api/riwayat:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


// =====================================================
// EDIT LAPORAN
// =====================================================

app.put('/api/laporan/:id', async (req, res) => {

    const {
        jam_masuk,
        jam_keluar,
        status
    } = req.body;

    try {

        await db.query(
            'UPDATE absensi SET jam_masuk = ?, jam_keluar = ?, status = ? WHERE id_absensi = ?',
            [
                jam_masuk,
                jam_keluar || null,
                status,
                req.params.id
            ]
        );

        res.json({
            message: 'Laporan absensi diperbarui'
        });

    } catch (err) {

        console.error('ERROR UPDATE LAPORAN:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


// =====================================================
// HAPUS LAPORAN
// =====================================================

app.delete('/api/laporan/:id', async (req, res) => {

    try {

        await db.query(
            'DELETE FROM absensi WHERE id_absensi = ?',
            [req.params.id]
        );

        res.json({
            message: 'Data absensi dihapus'
        });

    } catch (err) {

        console.error('ERROR DELETE LAPORAN:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


// =====================================================
// UPDATE ALAMAT
// =====================================================

app.put('/api/laporan/update-alamat/:id', async (req, res) => {

    try {

        await db.query(
            'UPDATE absensi SET alamat = ? WHERE id_absensi = ?',
            [
                req.body.alamat,
                req.params.id
            ]
        );

        res.json({
            message: 'Alamat permanen disimpan di database.'
        });

    } catch (err) {

        console.error('ERROR UPDATE ALAMAT:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


// =====================================================
// SERVER
// =====================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server API berjalan di port ${PORT}`);
});