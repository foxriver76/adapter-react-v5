/**
 * Copyright 2018-2023 bluefox <dogafox@gmail.com>
 *
 * MIT License
 *
 **/
'use strict';

const gulp  = require('gulp');
const babel = require('gulp-babel');
const sourcemaps = require('gulp-sourcemaps');
const typescript = require('gulp-typescript');
const fs = require('fs');
const cp = require('child_process');

function npmInstall(dir) {
    dir = dir || `${__dirname}/`;
    return new Promise((resolve, reject) => {
        // Install node modules
        const cwd = dir.replace(/\\/g, '/');

        const cmd = `npm install -f`;
        console.log(`"${cmd} in ${cwd}`);

        // System call used for update of js-controller itself,
        // because during the installation of the npm packet will be deleted too, but some files must be loaded even during the installation process.
        const child = cp.exec(cmd, {cwd});

        child.stderr.pipe(process.stderr);
        child.stdout.pipe(process.stdout);

        child.on('exit', (code /* , signal */) => {
            // code 1 is a strange error that cannot be explained. Everything is installed but error :(
            if (code && code !== 1) {
                reject(`Cannot install: ${code}`);
            } else {
                console.log(`"${cmd} in ${cwd} finished.`);
                // command succeeded
                resolve();
            }
        });
    });
}

gulp.task('npm', () => {
    if (fs.existsSync(`${__dirname}/src/node_modules`)) {
        return Promise.resolve();
    } else {
        return npmInstall();
    }
});

gulp.task('copy', () => Promise.all([
    gulp.src(['src/**/*.d.ts']).pipe(gulp.dest('dist')),
    gulp.src(['src/vendor/*.*']).pipe(gulp.dest('dist/vendor')),
    gulp.src(['src/assets/*.*']).pipe(gulp.dest('dist/assets')),
    gulp.src(['README.md']).pipe(gulp.dest('dist')),
    gulp.src(['LICENSE']).pipe(gulp.dest('dist')),
    gulp.src(['src/*.css']).pipe(gulp.dest('dist')),
    gulp.src(['src/Components/*.css']).pipe(gulp.dest('dist/Components')),
    gulp.src(['src/Components/**/*.css']).pipe(gulp.dest('dist/Components')),
    gulp.src(['src/Components/assets/*.*']).pipe(gulp.dest('dist/Components/assets')),
    gulp.src(['src/assets/devices/*.*']).pipe(gulp.dest('dist/assets/devices')),
    gulp.src(['src/assets/rooms/*.*']).pipe(gulp.dest('dist/assets/rooms')),
    gulp.src(['craco-module-federation.js']).pipe(gulp.dest('dist')),
    new Promise(resolve => {
        const package_ = require('./package.json');
        const packageSrc = require('./src/package.json');
        packageSrc.version = package_.version;
        packageSrc.dependencies = package_.dependencies;
        !fs.existsSync(`${__dirname}/dist`) && fs.mkdirSync(`${__dirname}/dist`);
        fs.writeFileSync(`${__dirname}/dist/package.json`, JSON.stringify(packageSrc, null, 2));
        resolve();
    })
]));

const tsProject = typescript.createProject('tsconfig.build.json');

gulp.task('typedefs', () => {
    return gulp.src(['src/**/*.js', 'src/**/*.jsx', '!src/gulpfile.js'])
        .pipe(tsProject())
        .dts
        .pipe(gulp.dest('dist'));
});

const babelOptions = {
    presets: ['@babel/preset-env', '@babel/preset-react'],
    plugins: [
        '@babel/plugin-proposal-class-properties',
        '@babel/plugin-transform-runtime'
    ]
};

function handleError (error) {
    console.log(error.toString());
    this.emit('end');
}

gulp.task('patchJsonSchemeForTable', async () => {
    const schema = require('./schemas/jsonConfig.json');
    const allOf = JSON.parse(JSON.stringify(schema.properties.items.patternProperties['^.+'].allOf));
    const pos = allOf.findIndex(item => item.if.properties.type.const === 'table');
    if (pos !== -1) {
        allOf.splice(pos, 1)
    }
    const properties = JSON.parse(JSON.stringify(schema.properties.items.patternProperties['^.+'].properties))
    Object.assign(properties, {
        type: {
            type: 'string'
        },
        attr: {
            type: 'string'
        },
        width: {
            type: [
                'number',
                'string'
            ]
        },
        title: {
            type: 'string'
        },
        filter: {
            type: 'boolean'
        },
        sort: {
            type: 'boolean'
        },
    });

    schema.properties.items.patternProperties['^.+'].allOf[pos].then.properties.items.items.properties = properties;
    schema.properties.items.patternProperties['^.+'].allOf[pos].then.properties.items.items.allOf = allOf;
    fs.writeFileSync('./schemas/jsonConfig.json', JSON.stringify(schema, null, 2));
});

gulp.task('patchReadme', async () => {
    const pack = require('./package.json');
    let readme = fs.readFileSync(`${__dirname}/README.md`).toString('utf8');
    readme = readme.replace(/"@iobroker\/adapter-react": "\^\d\.\d\.\d",/g, `"@iobroker/adapter-react": "^${pack.version}",`);
    fs.writeFileSync(`${__dirname}/README.md`, readme);
});

gulp.task('compile', gulp.parallel('copy',
    'typedefs',
    () => Promise.all([
        gulp.src(['src/Dialogs/*.js', 'src/Dialogs/**/*.js', 'src/Dialogs/*.jsx', 'src/Dialogs/**/*.jsx'])
            .pipe(sourcemaps.init())
            .pipe(babel(babelOptions))
            .on('error', handleError)
            .pipe(sourcemaps.write('.'))
            .pipe(gulp.dest('dist/Dialogs')),

        gulp.src(['src/icons/*.js', 'src/icons/**/*.js', 'src/icons/*.jsx', 'src/icons/**/*.jsx'])
            .pipe(sourcemaps.init())
            .pipe(babel(babelOptions))
            .on('error', handleError)
            .pipe(sourcemaps.write('.'))
            .pipe(gulp.dest('dist/icons')),

        gulp.src(['src/*.js', 'src/*.jsx', '!src/gulpfile.js', '!src/index.js'])
            .pipe(sourcemaps.init())
            .pipe(babel(babelOptions))
            .on('error', handleError)
            .pipe(sourcemaps.write('.'))
            .pipe(gulp.dest('dist')),

        gulp.src(['src/index.js'])
            .pipe(gulp.dest('dist')),

        gulp.src(['src/Components/*.js', 'src/Components/**/*.js', 'src/Components/*.jsч', 'src/Components/**/*.jsx'])
            .pipe(sourcemaps.init())
            .pipe(babel({
                presets: ['@babel/preset-env', '@babel/preset-react', '@babel/preset-flow'],
                plugins: [
                    '@babel/plugin-proposal-class-properties',
                    '@babel/plugin-transform-runtime',
                    ['inline-json-import', {}]
                ]
            }))
             .on('error', handleError)
            .pipe(sourcemaps.write('.'))
            .pipe(gulp.dest('dist/Components')),

        gulp.src(['src/i18n/*.json'])
            .pipe(gulp.dest('dist/i18n')),
    ])
));

gulp.task('default', gulp.series('npm', 'compile', 'patchReadme', 'patchJsonSchemeForTable'));