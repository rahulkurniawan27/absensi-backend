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

// 1. API Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await db.query(
            'SELECT * FROM `user` WHERE username = ?',
            [username]
        );
        
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Username atau password salah!' });
        }

        const user = rows[0];

        // Cek langsung password (jika tidak pakai bcrypt)
        if (password !== user.password) {
            return res.status(401).json({ error: 'Username atau password salah!' });
        }

        res.json({ message: 'Login Berhasil', user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= API KELOLA USER (ADMIN) =================
app.get('/api/users', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT u.id_user, u.nama, u.username,
                   IF(f.id_user IS NOT NULL, 'Sudah', 'Belum') AS status_wajah
            FROM \`user\` u
            LEFT JOIN \`sample_foto\` f ON u.id_user = f.id_user
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
    const { username, password, nama, role } = req.body;

    try {
        const [result] = await db.query(
            'INSERT INTO `user` (username, password, nama, role) VALUES (?, ?, ?, ?)',
            [username, password, nama, role || 'user']
        );

        res.json({ id_user: result.insertId });

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
    const { username, password, nama } = req.body;
    try {
        if(password) {
            await db.query('UPDATE `user` SET username=?, password=?, nama=? WHERE id_user=?', [username, password, nama, req.params.id]);
        } else {
            await db.query('UPDATE `user` SET username=?, nama=? WHERE id_user=?', [username, nama, req.params.id]);
        }
        res.json({ message: 'User diupdate' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM `user` WHERE id_user=?', [req.params.id]);
        res.json({ message: 'User dihapus' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= API WAJAH (BIOMETRIK) =================
app.post('/api/register-face', async (req, res) => {
    const { id_user, face_descriptor, foto_base64 } = req.body;
    try {
        const descriptorStr = JSON.stringify(face_descriptor);
        
        // 1. Cek apakah user ini sudah pernah mendaftarkan wajah sebelumnya
        const [cek] = await db.query('SELECT * FROM `sample_foto` WHERE id_user = ?', [id_user]);
        
        if (cek.length > 0) {
            // 2. Jika sudah ada, lakukan UPDATE ke kolom path_foto dan face_descriptor
            await db.query(
                'UPDATE `sample_foto` SET path_foto = ?, face_descriptor = ? WHERE id_user = ?', 
                [foto_base64, descriptorStr, id_user]
            );
        } else {
            // 3. Jika belum ada, lakukan INSERT data baru
            await db.query(
                'INSERT INTO `sample_foto` (id_user, path_foto, face_descriptor) VALUES (?, ?, ?)', 
                [id_user, foto_base64, descriptorStr]
            );
        }
        
        res.json({ message: 'Biometrik Wajah berhasil didaftarkan!' });
    } catch (err) {
        console.error("Error Database Register Face:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/face-descriptor/:id_user', async (req, res) => {
    try {
        // PERBAIKAN: Ambil dari kolom face_descriptor
        const [rows] = await db.query('SELECT face_descriptor FROM `sample_foto` WHERE id_user = ?', [req.params.id_user]);
        
        if (rows.length > 0) {
            // Kembalikan dengan format JSON yang diharapkan Frontend
            res.json({ descriptor: rows[0].face_descriptor }); 
        } else {
            res.status(404).json({ error: 'Wajah belum terdaftar' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= API JADWAL ABSENSI (ADMIN) =================
app.get('/api/jadwal', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM JADWAL LIMIT 1');
        res.json(rows[0]);
    } catch (err) {
    console.error('ERROR GET /api/jadwal:', err);
    res.status(500).json({
        error: err.message,
        code: err.code,
        sqlMessage: err.sqlMessage
    });
}
});

app.put('/api/jadwal/:id', async (req, res) => {
    const { hari, masuk, batas, pulang } = req.body;
    try {
        await db.query('UPDATE JADWAL SET hari=?, masuk=?, batas=?, pulang=? WHERE id=?', [hari, masuk, batas, pulang, req.params.id]);
        res.json({ message: 'Jadwal kerja berhasil diperbarui!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= API ABSENSI (MASUK & PULANG) =================
app.post('/api/absen', async (req, res) => {
    // Tambahkan 'alamat' pada penerimaan data
    const { id_user, latitude, longitude, foto_absensi, confidence, jenis_absen, alamat } = req.body;
    
    if (jenis_absen !== 'masuk' && jenis_absen !== 'keluar') {
        return res.status(400).json({ error: `Jenis absensi tidak valid.` });
    }

    try {
        const now = new Date();
        const today = now.toLocaleDateString('en-CA'); 
        const time = now.toTimeString().split(' ')[0]; 
        
        const [cek] = await db.query('SELECT * FROM `absensi` WHERE id_user = ? AND tanggal = ?', [id_user, today]);

        if (jenis_absen === 'masuk') {
            if (cek.length > 0) return res.status(400).json({ error: 'Anda sudah absen masuk hari ini.' });
            
            const [jadwalDb] = await db.query('SELECT * FROM JADWAL LIMIT 1');
            let statusKehadiran = 'Hadir'; 
            if (jadwalDb.length > 0) {
                const batasTelat = jadwalDb[0].batas; 
                if (time > batasTelat) statusKehadiran = 'Terlambat'; 
            }

            // PERBAIKAN: Masukkan variabel alamat ke database
            await db.query(
                'INSERT INTO absensi (id_user, tanggal, jam_masuk, status, foto_absensi, confidence, latitude, longitude, lat_lon, alamat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    id_user,
                    today,
                    jam_masuk,
                    status,
                    foto_absensi,
                    confidence,
                    latitude,
                    longitude,
                    lat_lon,
                    alamat
                ]
            );
            res.json({ message: `Absen MASUK direkam! Status: ${statusKehadiran}` });

        } else if (jenis_absen === 'keluar') {
            if (cek.length === 0) return res.status(400).json({ error: 'Anda belum absen masuk hari ini.' });
            if (cek[0].jam_keluar !== null) return res.status(400).json({ error: 'Anda sudah absen pulang hari ini.' });
            
            // PERBAIKAN: Update juga alamat saat pulang (jika posisi berubah)
            await db.query(
                `UPDATE `absensi` SET jam_keluar = ?, foto_absensi = ?, confidence = ?, latitude = ?, longitude = ?, lat_lon = ?, alamat = ? 
                 WHERE id_user = ? AND tanggal = ?`,
                [time, foto_absensi, confidence, latitude, longitude, `${latitude},${longitude}`, alamat, id_user, today]
            );
            res.json({ message: 'Absen PULANG direkam!' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= API RIWAYAT & LAPORAN =================
app.get('/api/laporan', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT a.id_absensi as id, DATE_FORMAT(a.tanggal, '%d %b %Y') as tanggal, 
                   u.nama, a.jam_masuk, a.jam_keluar, a.status, 
                   a.latitude, a.longitude, a.alamat 
            FROM `absensi` a 
            JOIN `user` u ON a.id_user = u.id_user 
            ORDER BY a.tanggal DESC, a.jam_masuk DESC
        `);
        res.json(rows);
        } catch (err) {
        console.error('ERROR LAPORAN ABSENSI:', err);

        res.status(500).json({
            error: err.message,
            code: err.code,
            sqlMessage: err.sqlMessage
        });
    }
});

app.get('/api/riwayat/:id_user', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT id_absensi as id, DATE_FORMAT(tanggal, '%d %b %Y') as tanggal, jam_masuk, jam_keluar, status, latitude, longitude 
            FROM `absensi` WHERE id_user = ? ORDER BY tanggal DESC, jam_masuk DESC
        `, [req.params.id_user]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API Edit Data Absensi (Admin)
app.put('/api/laporan/:id', async (req, res) => {
    const { jam_masuk, jam_keluar, status } = req.body;
    try {
        await db.query(
            'UPDATE `absensi` SET jam_masuk=?, jam_keluar=?, status=? WHERE id_absensi=?', 
            [jam_masuk, jam_keluar || null, status, req.params.id]
        );
        res.json({ message: 'Laporan absensi diperbarui' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API Hapus Data Absensi (Admin)
app.delete('/api/laporan/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM `absensi` WHERE id_absensi=?', [req.params.id]);
        res.json({ message: 'Data absensi dihapus' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API Khusus untuk menyimpan otomatis hasil terjemahan GPS ke database
app.put('/api/laporan/update-alamat/:id', async (req, res) => {
    try {
        await db.query(
            'UPDATE `absensi` SET alamat = ? WHERE id_absensi = ?', 
            [req.body.alamat, req.params.id]
        );
        res.json({ message: 'Alamat permanen disimpan di database.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server API berjalan di port ${PORT}`));