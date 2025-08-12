rm -Rf generated
mkdir -p generated

cd ../proto
protoc --go_out=../core/generated --go_opt=paths=source_relative \
    --go-grpc_out=../core/generated --go-grpc_opt=paths=source_relative \
    *.proto

cd ..
go build -o build/medicine-rag .