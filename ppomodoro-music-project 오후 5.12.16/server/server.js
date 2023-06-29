const tf = require('@tensorflow/tfjs-node');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const util = require('util');
const {MusicRNN} = require('@magenta/music/node/music_rnn');
const { NoteSequence } = require('@magenta/music/node/protobuf');
const { midiToSequenceProto, sequenceProtoToMidi, sequences} = require('@magenta/music/node/core');
let midiParser  = require('midi-parser-js');

const upload = multer({ dest: 'uploads/' });
const app = express();

app.use(cors());

let SEQUENCE_PATH = '../sequence.json'; // 수정된 경로
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const exportSequence = async (sequence, filePath) => {
    try {
        const sequenceJson = JSON.stringify(sequence);
        await fs.promises.writeFile(filePath, sequenceJson, 'utf8');
        console.log(`NoteSequence JSON has been written to ${filePath}`);
        SEQUENCE_PATH = filePath;
    } catch (error) {
        console.error('Failed to export sequence:', error);
    }
};

const validateMidiFile = async (filePath) => {
    try {
        await fs.readFile(filePath, 'base64', (err, data) => {
                const midiArray = midiParser.parse(data);
                console.log('midiArray', midiArray);
            });
    } catch (error) {
        console.error('Invalid MIDI file:', error);
        // 유효하지 않은 MIDI 파일인 경우에 대한 처리
    }
};

let uploadedSequence = null;

app.post('/api/upload', upload.single('file'), async (req, res) => {
    const filePath = req?.file?.path;
    console.log(req.file);

    try {
        // 파일이 존재하는지 확인
        fs.accessSync(filePath, fs.constants.F_OK);
        console.log('File exists');

        // MIDI 파일 유효성 검증
        await validateMidiFile(filePath);
        // 시퀀스 생성
        const midiData = await fs.promises.readFile(filePath);
        uploadedSequence = midiToSequenceProto(midiData);

        res.json({ message: 'File uploaded and parsed', filePath });

    } catch (error) {
        console.error('Error parsing MIDI file:', error);
        res.status(500).json({ error: 'Failed to parse the file' });
    } finally {
        // 업로드한 파일 삭제
        fs.unlinkSync(filePath);
    }
});

const importSequence = async () => {
    try {
        const sequenceJson = await readFile(SEQUENCE_PATH, 'utf8');
        const sequence = JSON.parse(sequenceJson);
        const noteSequence = sequences.jsonToNoteSequence(sequence);

        return noteSequence;
    } catch (error) {
        console.error('Error importing sequence:', error);
        return null;
    }
};

app.post('/api/generate', async (req, res) => {
    // 패스에 현재시각 추가
    let outputMidiPath = `../${ Date.now() }_extended.mid` ; // 실제 파일 경로를 지정해야 함

    let importedNote = uploadedSequence;
    if (!importedNote) {
        console.log('No uploaded sequence found, using default sequence')
        outputMidiPath = `../${ Date.now() }_new.mid`  ; // 실제 파일 경로를 지정해야 함
        importedNote = new NoteSequence();
        importedNote.totalQuantizedSteps = 1,
        importedNote.quantizationInfo = { stepsPerQuarter: 1 }; // quantization 정보 설정
        importedNote.tempos = [ { time: 0, qpm: 103.33343666677001 } ]; // 템포 설정
        // 음표 추가 예시
        const note = new NoteSequence.Note();
        note.pitch = 60; // 음의 높이 설정
        note.velocity = 100; // 음의 세기 설정
        note.isDrum = false; // 드럼 여부 설정
        note.instrument = 9; // 악기 설정
        note.startTime = 0; // 시작 시간 설정
        note.endTime = 5; // 종료 시간 설정
        isDrum: true,
        importedNote.notes.push(note);

        const note2 = new NoteSequence.Note();
        note2.pitch = 62; // 음의 높이 설정
        note2.velocity = 100; // 음의 세기 설정
        note2.isDrum = false; // 드럼 여부 설정
        note2.instrument = 5; // 악기 설정
        note2.startTime = 0; // 시작 시간 설정
        note2.endTime = 5; // 종료 시간 설정
        importedNote.notes.push(note2);
    } else {
        const newNote = new NoteSequence.Note();
        newNote.pitch = 60; // 새로운 음표의 피치 설정
        newNote.velocity = 121,
        newNote.instrument = 8,
        newNote.startTime = importedNote.totalTime; // 이전 음악의 종료 시간으로부터 시작
        newNote.endTime = newNote.startTime + 3; // 종료 시간은 시작 시간에서 1초 뒤로 설정
        importedNote.notes.push(newNote);
        console.log('ㄷxtend', importedNote);

        // MusicRNN 모델 로드
        const qns = sequences.quantizeNoteSequence(importedNote, 4);
        const model = new MusicRNN('https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn');
        await model.initialize();
        // // 모델을 사용하여 음악 확장
        let generated;
        try {
            console.log('qns', qns)
            generated = await model.continueSequence(qns, 20, 1.1);
        } catch (error) {
            console.error('Error generating sequence:', error);
        }
        console.log('generated', generated);
        generated?.notes && importedNote.notes.push(...generated.notes);
    }

    // 시퀀스 내보내기
    saveMidiFile(outputMidiPath, importedNote);
    res.json({ message: 'File generated', filePath: outputMidiPath });
});

async function saveMidiFile(filePath, noteSequence) {
    try {
        const midiData = await sequenceProtoToMidi(noteSequence);
        await fs.promises.writeFile(filePath, midiData, 'binary');
        console.log('MIDI file saved:', filePath);
        uploadedSequence = noteSequence;
    } catch (error) {
        console.error('Error saving MIDI file:', error);
        throw error;
    }
}

// app.post('/api/generate', async (req, res) => {
    // const sequence = await importSequence();
    // if (!sequence) {
    //     res.status(500).json({ error: 'Failed to import sequence' });
    //     return;
    // }
    //
    // const averageTempo = sequence.tempos.reduce((sum, tempo) => sum + tempo.qpm, 0) / sequence.tempos.length;
    // sequence.tempos = [{time: 0, qpm: averageTempo}];
    //
    // const MIN_PITCH = 60;
    // const MAX_PITCH = 83;
    //
    // let quantizedSequence = sequences.quantizeNoteSequence(sequence, 4);
    // quantizedSequence.notes = quantizedSequence.notes.filter(note => note.pitch >= MIN_PITCH && note.pitch <= MAX_PITCH);
    //
    // console.log('modifiedSequence', quantizedSequence);
    // const modifiedSequence = sequences.clone(quantizedSequence);
    // const model = new MusicRNN('https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn');
    // // const model = new MusicRNN('https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/chord_pitches_improv');
    //
    // await model.initialize();
    // if (!model.isInitialized()) {
    //     console.error('Failed to initialize the model.');
    //     return;
    // }
    // const outputMidiPath = '../output.mid'; // 실제 파일 경로를 지정해야 함
    //
    // let generated;
    //
    // await tf.tidy(async () => {
    //     try {
    //         generated = await model.continueSequence(modifiedSequence, 4);
    //     } catch (error) {
    //         console.error('Error generating sequence:', error);
    //     } finally {
    //         model.dispose();
    //     }
    // });
    // console.log(2, 'generated', generated);
    //
    // const noteSequence = new NoteSequence();
    // console.log(3);
    // noteSequence.notes = Array.from(generated).map(item => new NoteSequence.Note.fromObject(item));
    // console.log(4, noteSequence.notes);
    // noteSequence.quantizationInfo = modifiedSequence.quantizationInfo;
    // console.log(5, noteSequence.quantizationInfo);
    // await saveMidiFile(outputMidiPath, midiData);
    //
    // console.log(6);
    // res.set('Content-Disposition', 'attachment; filename="output.mid"');
    // res.set('Content-Type', 'audio/midi');
    // const fileData = fs.readFileSync(outputMidiPath);
    // console.log(7, fileData)
    // res.send(fileData);
    // console.log(8);
    // await validateMidiFile(outputMidiPath);
    // console.log(9);
// });
// async function saveMidiFile(outputMidiPath, midiData) {
//     try {
//         console.log('in');
//         const buffer = Buffer.from(midiData, 'binary');
//         console.log('buffer', buffer);
//         await writeFile(outputMidiPath, buffer);
//         console.log('MIDI 파일이 성공적으로 저장되었습니다.');
//     } catch (err) {
//         console.error('MIDI 파일 저장 중 에러가 발생했습니다:', err);
//         throw err;
//     }
// }



app.listen(5000, () => console.log('Server running on port 5000'));
