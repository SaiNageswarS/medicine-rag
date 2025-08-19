rm -Rf build

cd proto

rm -Rf ./generated
mkdir -p ./generated

protoc --go_out=./generated --go_opt=paths=source_relative \
    --go-grpc_out=./generated --go-grpc_opt=paths=source_relative \
    login.proto

cd ..

cd core 
go build -o ../build/medicine-rag .

cd ..

cd web
go build -o ../build/web-server .

cd ..