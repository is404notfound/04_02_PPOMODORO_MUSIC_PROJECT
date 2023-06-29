import React, { useState } from 'react';
import axios from 'axios';

function HomePage() {
    const [loading, setLoading] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [sequence, setSequence] = useState<number[]>([]);
    const [generatedFileUrl, setGeneratedFileUrl] = useState<string | null>(null);

    const handleUpload = async (event: any) => {
        const file = event.target.files[0];
        setFile(file);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const { data } = await axios.post('/api/upload', formData);
            // 서버에서 반환하는 sequence 경로를 저장합니다.
            setSequence(data.filePath);
        } catch (error) {
            console.error('Failed to upload the file', error);
        }
    };

    const handleGenerate = async () => {
        console.log('sequence', sequence);
        if (!sequence) {
            alert('Please upload a MIDI file first.');
            return;
        }

        try {
            const { data } = await axios.post('/api/generate', { sequence });
            // 생성된 음악 파일이 저장된 위치를 반환받습니다.
            // 이 위치에서 파일을 다운로드 받을 수 있습니다.
            const generatedFilePath = data.filePath;
            setGeneratedFileUrl(generatedFilePath);

            // TODO: generatedFilePath를 사용해 사용자에게 음악을 제공합니다.
        } catch (error) {
            console.error('Failed to generate music', error);
        }
    };


    return (
        <div>
            <h1>My Music App</h1>
            <input type="file" accept=".mid" onChange={handleUpload} />
            <button onClick={handleGenerate} disabled={loading}>
                Generate Music
            </button>
            {generatedFileUrl && <a href={generatedFileUrl} download>Download Generated Music</a>}
            {loading && <p>Loading...</p>}
        </div>
    );
}

export default HomePage;
